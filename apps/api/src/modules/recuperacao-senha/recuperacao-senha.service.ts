import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import type {
  EsqueciSenhaInput,
  RedefinirSenhaInput,
} from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { smtpDaEmpresa } from '../../common/mail/smtp-da-empresa';
import { buscarEmpresaDoEmail } from '../../common/mail/email-layout';
import { urlDoSistema } from '../../common/mail/email-acesso';
import { montarEmailRedefinicao } from '../../common/mail/email-redefinicao';
import { ParametrosService } from '../parametros/parametros.service';
import { EmailConfigService } from '../email/email-config.service';
import { PoliticaSenhaService } from '../politica-senha/politica-senha.service';
import { AcessosService } from '../acessos/acessos.service';

/** Quanto tempo o link vale. */
export const VALIDADE_MINUTOS = 30;

/** Links por conta por hora (decisão de 2026-10-15). */
export const LINKS_POR_HORA = 3;

/** O mesmo custo do resto da plataforma (`usuarios.service`, `auth.service`). */
const SALT_ROUNDS = 12;

const LINK_INVALIDO =
  'Este link de redefinição é inválido ou expirou. Peça um novo em "Esqueci minha senha".';

export const hashDoToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * "Esqueci minha senha" por link de uso único — ver
 * `docs/planos/2026-10-13-esqueci-minha-senha.md`.
 *
 * Roda sem usuário logado, como o login: `usuarios` e `empresas` têm RLS por
 * grupo, e sem contexto vale o modo sistema do papel `plataforma_app`.
 */
@Injectable()
export class RecuperacaoSenhaService {
  private readonly logger = new Logger(RecuperacaoSenhaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly parametros: ParametrosService,
    private readonly emailConfig: EmailConfigService,
    private readonly politica: PoliticaSenhaService,
    private readonly acessos: AcessosService,
  ) {}

  /**
   * Pede o link. **A resposta é sempre a mesma**, exista o e-mail ou não, e
   * qualquer falha só vai para o log: a tela não pode servir para descobrir
   * quem tem conta. Não muda a senha atual — ela vale até o link ser usado.
   */
  async pedir(input: EsqueciSenhaInput, meta: Meta = {}) {
    try {
      await this.enviarLink(input, meta);
    } catch (erro) {
      this.logger.error(
        `Falha no pedido de redefinição de senha: ${String(erro)}`,
      );
    }
    return { ok: true };
  }

  private async enviarLink(input: EsqueciSenhaInput, meta: Meta) {
    const email = input.email.toLowerCase();
    const usuario = await this.prisma.usuario.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        deletedAt: null,
        ativo: true,
      },
      select: { id: true, nome: true, email: true },
    });
    if (!usuario) return;

    // Limite por conta, além do por IP do controller: trocando de IP dava
    // para encher a caixa de alguém de links. Acima do limite a resposta é a
    // mesma (quem pede não sabe), só não sai e-mail.
    const recentes = await this.prisma.senhaRedefinicao.count({
      where: {
        usuarioId: usuario.id,
        criadoEm: { gte: new Date(Date.now() - 60 * 60_000) },
      },
    });
    if (recentes >= LINKS_POR_HORA) {
      this.logger.warn(
        `Redefinição de senha: limite de ${LINKS_POR_HORA} links por hora atingido para ${usuario.email}.`,
      );
      return;
    }

    const empresaId = await this.empresaDoPedido(
      usuario.id,
      input.empresaAlias,
    );
    const link = urlDoSistema();
    if (!link) {
      this.logger.warn(
        'Sem WEB_URL nem CORS_ORIGIN: não há endereço para o link de redefinição.',
      );
      return;
    }

    // Um link vivo por usuário: pedir de novo invalida o anterior.
    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction(async (tx) => {
      await tx.senhaRedefinicao.updateMany({
        where: { usuarioId: usuario.id, usadoEm: null },
        data: { usadoEm: new Date() },
      });
      await tx.senhaRedefinicao.create({
        data: {
          usuarioId: usuario.id,
          tokenHash: hashDoToken(token),
          expiraEm: new Date(Date.now() + VALIDADE_MINUTOS * 60_000),
          ip: meta.ip ?? null,
        },
      });
    });

    const empresa = empresaId
      ? await buscarEmpresaDoEmail(this.prisma, empresaId)
      : null;
    const { assunto, html } = montarEmailRedefinicao({
      empresa,
      nome: usuario.nome,
      link: `${link}/redefinir-senha?token=${token}`,
      validadeMinutos: VALIDADE_MINUTOS,
    });
    // O servidor da empresa quando ela liberou o e-mail de acesso
    // (Administração > E-mail > senha provisória); senão, o da plataforma.
    const usaDaEmpresa =
      !!empresaId &&
      (await this.emailConfig.disponibilidade(empresaId)).senhaProvisoria;
    const smtp = usaDaEmpresa
      ? await smtpDaEmpresa(this.parametros, empresaId)
      : null;
    const enviado = await this.mail.send(usuario.email, assunto, html, smtp);

    await this.acessos.registrar({
      evento: 'senha_redefinicao_pedida',
      email: usuario.email,
      usuarioId: usuario.id,
      empresaId,
      detalhe: enviado
        ? 'Link enviado por e-mail'
        : 'E-mail não enviado (sem servidor configurado)',
      ...meta,
    });
  }

  /**
   * A empresa do pedido: a da tela de login (alias), se o usuário tem vínculo
   * ativo com ela; senão, a primeira com vínculo ativo; senão, nenhuma.
   */
  private async empresaDoPedido(usuarioId: string, alias?: string) {
    // `usuario_empresas` tem RLS por empresa **ou** pelo próprio usuário, e
    // aqui ainda não há nenhum dos dois no contexto: sem `withUsuario` a
    // consulta volta vazia, sem erro, e o e-mail sairia sem a empresa.
    const vinculos = await this.prisma.withUsuario(usuarioId, (tx) =>
      tx.usuarioEmpresa.findMany({
        where: { usuarioId, ativo: true, empresa: { deletedAt: null } },
        select: { empresaId: true, empresa: { select: { alias: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    );
    const daTela = alias
      ? vinculos.find((v) => v.empresa.alias === alias)
      : undefined;
    return (daTela ?? vinculos[0])?.empresaId ?? null;
  }

  /**
   * Cria a senha nova pelo link: confere o token (uso único, no prazo), aplica
   * a política de senha e o histórico, desbloqueia a conta e derruba as
   * sessões abertas — quem esqueceu a senha pode estar trocando justamente
   * porque alguém entrou com ela.
   */
  async redefinir(input: RedefinirSenhaInput, meta: Meta = {}) {
    const pedido = await this.prisma.senhaRedefinicao.findUnique({
      where: { tokenHash: hashDoToken(input.token) },
      include: {
        usuario: {
          select: {
            id: true,
            email: true,
            senhaHash: true,
            deletedAt: true,
            ativo: true,
          },
        },
      },
    });
    if (
      !pedido ||
      pedido.usadoEm ||
      pedido.expiraEm.getTime() < Date.now() ||
      pedido.usuario.deletedAt ||
      !pedido.usuario.ativo
    ) {
      throw new BadRequestException(LINK_INVALIDO);
    }
    const usuario = pedido.usuario;

    await this.politica.validarSenhaDoUsuario(usuario.id, input.novaSenha);
    await this.politica.validarReuso(
      usuario.id,
      input.novaSenha,
      usuario.senhaHash,
    );

    const novoHash = await bcrypt.hash(input.novaSenha, SALT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      // Marca o uso primeiro, condicionado a ainda não ter sido usado: dois
      // envios ao mesmo tempo com o mesmo link não trocam a senha duas vezes.
      const { count } = await tx.senhaRedefinicao.updateMany({
        where: { id: pedido.id, usadoEm: null },
        data: { usadoEm: new Date() },
      });
      if (count === 0) throw new BadRequestException(LINK_INVALIDO);
      await this.politica.registrarHistorico(usuario.id, usuario.senhaHash, tx);
      await tx.usuario.update({
        where: { id: usuario.id },
        data: {
          senhaHash: novoHash,
          senhaAlteradaEm: new Date(),
          deveTrocarSenha: false,
          tentativasFalhas: 0,
          bloqueadoAte: null,
        },
      });
      await tx.refreshToken.updateMany({
        where: { usuarioId: usuario.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    await this.acessos.encerrarSessoesDoUsuario(usuario.id, 'senha_redefinida');
    await this.acessos.registrar({
      evento: 'senha_redefinida',
      email: usuario.email,
      usuarioId: usuario.id,
      empresaId: await this.empresaDoPedido(usuario.id),
      detalhe: 'Senha trocada pelo link de "Esqueci minha senha"',
      ...meta,
    });
    return { ok: true };
  }
}
