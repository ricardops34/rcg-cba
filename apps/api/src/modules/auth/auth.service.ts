import { randomBytes, createHash } from 'node:crypto';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PoliticaSenhaService } from '../politica-senha/politica-senha.service';
import { AcessosService } from '../acessos/acessos.service';
import { HorarioTrabalhoService } from '../acessos/horario-trabalho.service';
import { ForaDoExpedienteException } from '../../common/horario/horario-trabalho';
import type { ChangePasswordInput, LoginInput, RefreshInput } from '@plataforma/contracts';

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

const SALT_ROUNDS = 12;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly politicaSenhaService: PoliticaSenhaService,
    private readonly acessos: AcessosService,
    private readonly horarios: HorarioTrabalhoService,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async buildAccessToken(usuarioEmpresaId: string, empresaId: string) {
    const vinculo = await this.prisma.withTenant(empresaId, (tx) =>
      tx.usuarioEmpresa.findUniqueOrThrow({
        where: { id: usuarioEmpresaId },
        include: {
          usuario: true,
          empresa: true,
          perfil: {
            include: {
              permissoes: {
                where: { permitido: true },
                include: { rotina: true },
              },
            },
          },
        },
      }),
    );

    const permissoes = vinculo.perfil.permissoes.map(
      (p) => `${p.rotina.codigo}.${p.acao}`,
    );

    const payload = {
      sub: vinculo.usuarioId,
      nome: vinculo.usuario.nome,
      email: vinculo.usuario.email,
      empresaAtivaId: vinculo.empresaId,
      isAdmin: vinculo.perfil.sistemaBase,
      permissoes,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as never,
    });

    return { accessToken, vinculo };
  }

  private async findVinculoAtivo(usuarioId: string, empresaId?: string) {
    return this.prisma.withUsuario(usuarioId, (tx) =>
      tx.usuarioEmpresa.findFirst({
        where: {
          usuarioId,
          ativo: true,
          empresa: { ativo: true },
          ...(empresaId ? { empresaId } : {}),
        },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  /**
   * true se a senha foi marcada para troca obrigatória (reset por admin,
   * senha provisória de vendedor) ou expirou pela política vigente — usado
   * tanto no login quanto em `me()` (esta última reavalia a cada carga da
   * sessão, pra pegar uma expiração que ocorreu no meio de uma sessão longa).
   */
  private async computeMustChangePassword(usuario: {
    id: string;
    deveTrocarSenha: boolean;
    senhaAlteradaEm: Date | null;
  }): Promise<boolean> {
    const politica = await this.politicaSenhaService.getVigenteParaUsuario(
      usuario.id,
    );
    const senhaExpirada =
      !!politica.diasParaExpirar &&
      !!usuario.senhaAlteradaEm &&
      Date.now() - usuario.senhaAlteradaEm.getTime() >=
        politica.diasParaExpirar * 24 * 60 * 60 * 1000;
    return usuario.deveTrocarSenha || senhaExpirada;
  }

  async login(input: LoginInput, meta: RequestMeta) {
    const email = input.email.toLowerCase();
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });

    if (!usuario || !usuario.ativo) {
      await this.acessos.registrar({
        evento: 'login_falha',
        email,
        usuarioId: usuario?.id ?? null,
        detalhe: usuario ? 'Usuário inativo' : 'E-mail não cadastrado',
        ...meta,
      });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (usuario.bloqueadoAte && usuario.bloqueadoAte > new Date()) {
      await this.acessos.registrar({
        evento: 'login_bloqueado',
        email,
        usuarioId: usuario.id,
        detalhe: `Conta bloqueada até ${usuario.bloqueadoAte.toISOString()}`,
        ...meta,
      });
      throw new HttpException(
        'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente mais tarde.',
        HttpStatus.LOCKED,
      );
    }

    const senhaValida = await bcrypt.compare(input.senha, usuario.senhaHash);
    if (!senhaValida) {
      const politica = await this.politicaSenhaService.getVigenteParaUsuario(
        usuario.id,
      );
      const tentativas = usuario.tentativasFalhas + 1;
      const bloqueou = tentativas >= politica.tentativasAntesBloqueio;
      await this.prisma.usuario.update({
        where: { id: usuario.id },
        data: bloqueou
          ? {
              tentativasFalhas: 0,
              bloqueadoAte: new Date(Date.now() + politica.minutosBloqueio * 60_000),
            }
          : { tentativasFalhas: tentativas },
      });
      await this.acessos.registrar({
        evento: bloqueou ? 'login_bloqueado' : 'login_falha',
        email,
        usuarioId: usuario.id,
        detalhe: bloqueou
          ? `Senha incorreta ${tentativas}ª vez — conta bloqueada por ${politica.minutosBloqueio} min`
          : `Senha incorreta (tentativa ${tentativas} de ${politica.tentativasAntesBloqueio})`,
        ...meta,
      });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Expediente só é avaliado depois da senha conferir: quem erra a senha
    // recebe sempre a mesma resposta, sem descobrir de tabela nenhuma.
    const expediente = await this.horarios.verificar(usuario.id);
    if (!expediente.dentro) {
      await this.acessos.registrar({
        evento: 'login_fora_horario',
        email,
        usuarioId: usuario.id,
        detalhe: expediente.motivo,
        ...meta,
      });
      throw new ForaDoExpedienteException(
        `Acesso permitido apenas em horário de trabalho. ${expediente.motivo}.`,
      );
    }

    // Quando o login vem com o alias da empresa (?empresa=<alias> na tela de
    // login), a sessão entra diretamente nessa empresa — desde que o usuário
    // tenha vínculo ativo com ela. Sem alias, cai na primeira empresa ativa.
    let empresaId: string | undefined;
    if (input.empresaAlias) {
      const empresa = await this.prisma.empresa.findFirst({
        where: { alias: input.empresaAlias, ativo: true, deletedAt: null },
        select: { id: true },
      });
      if (!empresa) {
        throw new ForbiddenException('Você não tem acesso a esta empresa');
      }
      empresaId = empresa.id;
    }

    const vinculo = await this.findVinculoAtivo(usuario.id, empresaId);
    if (!vinculo) {
      await this.acessos.registrar({
        evento: 'login_falha',
        email,
        usuarioId: usuario.id,
        detalhe: input.empresaAlias
          ? 'Sem vínculo ativo com a empresa informada'
          : 'Usuário sem empresa ativa vinculada',
        ...meta,
      });
      throw input.empresaAlias
        ? new ForbiddenException('Você não tem acesso a esta empresa')
        : new UnauthorizedException('Usuário sem empresa ativa vinculada');
    }

    const { accessToken } = await this.buildAccessToken(vinculo.id, vinculo.empresaId);
    // A sessão nasce aqui e acompanha as renovações de token pelo sessaoId —
    // é ela que mede o tempo de uso na tela de Acessos.
    const sessaoId = await this.acessos.abrirSessao({
      usuarioId: usuario.id,
      empresaId: vinculo.empresaId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    const refreshToken = await this.issueRefreshToken(
      usuario.id,
      vinculo.empresaId,
      meta,
      sessaoId,
    );

    const mustChangePassword = await this.computeMustChangePassword(usuario);

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoLogin: new Date(), tentativasFalhas: 0, bloqueadoAte: null },
    });

    await this.acessos.registrar({
      evento: 'login_sucesso',
      email,
      usuarioId: usuario.id,
      empresaId: vinculo.empresaId,
      ...meta,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60,
      mustChangePassword,
    };
  }

  /**
   * Branding público de uma empresa pelo alias, para a tela de login exibir
   * logo e nome antes de existir sessão. Não expõe dados sensíveis.
   */
  async empresaBranding(alias: string) {
    const empresa = await this.prisma.empresa.findFirst({
      where: { alias: alias.toLowerCase(), ativo: true, deletedAt: null },
      select: { alias: true, nomeFantasia: true, logoUrl: true },
    });
    if (!empresa || !empresa.alias) {
      throw new NotFoundException('Empresa não encontrada');
    }
    return {
      alias: empresa.alias,
      nomeFantasia: empresa.nomeFantasia,
      logoUrl: empresa.logoUrl,
    };
  }

  private async issueRefreshToken(
    usuarioId: string,
    empresaId: string,
    meta: RequestMeta,
    sessaoId: string | null,
  ) {
    const token = randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        usuarioId,
        empresaId,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        ip: meta.ip,
        userAgent: meta.userAgent,
        sessaoId,
      },
    });
    return token;
  }

  async refresh(input: RefreshInput, meta: RequestMeta) {
    const tokenHash = this.hashToken(input.refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    // A renovação não passa pelo JwtAuthGuard (é rota pública, autenticada
    // pelo próprio refresh token), então a trava de expediente precisa ser
    // conferida aqui também — senão bastaria deixar a aba aberta para o
    // sistema se renovar indefinidamente depois do fim do turno.
    const expediente = await this.horarios.verificar(stored.usuarioId);
    if (!expediente.dentro) {
      await this.encerrarAcessoPorHorario(stored.usuarioId, expediente.motivo);
      throw new ForaDoExpedienteException(
        `Acesso permitido apenas em horário de trabalho. ${expediente.motivo}.`,
      );
    }

    // Mantém a mesma empresa ativa da sessão original; só cai para a
    // primeira disponível se aquele vínculo específico não existir mais.
    const vinculo =
      (stored.empresaId
        ? await this.findVinculoAtivo(stored.usuarioId, stored.empresaId)
        : null) ?? (await this.findVinculoAtivo(stored.usuarioId));
    if (!vinculo) {
      throw new UnauthorizedException('Usuário sem empresa ativa vinculada');
    }

    const { accessToken } = await this.buildAccessToken(vinculo.id, vinculo.empresaId);
    const refreshToken = await this.issueRefreshToken(
      stored.usuarioId,
      vinculo.empresaId,
      meta,
      stored.sessaoId,
    );
    // Renovar token é o sinal de que a sessão segue em uso — é o que faz o
    // tempo de uso crescer sem uma escrita por requisição.
    if (stored.sessaoId) {
      await this.acessos.tocarSessao(stored.sessaoId, vinculo.empresaId);
    }

    return { accessToken, refreshToken, expiresIn: 15 * 60 };
  }

  /**
   * Corta o acesso de quem saiu do expediente: revoga os refresh tokens
   * abertos (para a aba deixada aberta não se renovar), fecha as sessões e
   * deixa o evento no rastro de acessos.
   */
  private async encerrarAcessoPorHorario(usuarioId: string, motivo: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { email: true },
    });
    await this.prisma.refreshToken.updateMany({
      where: { usuarioId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.acessos.encerrarSessoesDoUsuario(usuarioId, 'fora_horario');
    await this.acessos.registrar({
      evento: 'acesso_fora_horario',
      email: usuario?.email ?? '',
      usuarioId,
      detalhe: motivo,
    });
  }

  async logout(input: RefreshInput) {
    const tokenHash = this.hashToken(input.refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        sessaoId: true,
        empresaId: true,
        usuarioId: true,
        usuario: { select: { email: true } },
      },
    });
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (stored) {
      if (stored.sessaoId) {
        await this.acessos.encerrarSessao(stored.sessaoId, 'logout');
      }
      await this.acessos.registrar({
        evento: 'logout',
        email: stored.usuario.email,
        usuarioId: stored.usuarioId,
        empresaId: stored.empresaId,
      });
    }
    return { success: true };
  }

  /** Troca a empresa ativa da sessão, emitindo um novo par de tokens. */
  async switchEmpresa(usuarioId: string, empresaId: string, meta: RequestMeta) {
    const vinculo = await this.findVinculoAtivo(usuarioId, empresaId);
    if (!vinculo) {
      throw new ForbiddenException(
        'Usuário não tem acesso a esta empresa',
      );
    }

    const { accessToken } = await this.buildAccessToken(vinculo.id, vinculo.empresaId);
    // Trocar de empresa não é uma sessão nova — é a mesma pessoa, seguindo o
    // trabalho. Reaproveita a sessão aberta (o corpo da requisição não traz o
    // refresh token, então ela é localizada pelo usuário) e só abre outra se
    // não houver nenhuma, caso de sessão já encerrada por horário.
    const aberta = await this.prisma.sessao.findFirst({
      where: { usuarioId, encerradaEm: null },
      orderBy: { iniciadaEm: 'desc' },
      select: { id: true },
    });
    const sessaoId =
      aberta?.id ??
      (await this.acessos.abrirSessao({
        usuarioId,
        empresaId: vinculo.empresaId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      }));
    const refreshToken = await this.issueRefreshToken(
      usuarioId,
      vinculo.empresaId,
      meta,
      sessaoId,
    );
    await this.acessos.tocarSessao(sessaoId, vinculo.empresaId);

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { email: true },
    });
    await this.acessos.registrar({
      evento: 'troca_empresa',
      email: usuario?.email ?? '',
      usuarioId,
      empresaId: vinculo.empresaId,
      ...meta,
    });

    return { accessToken, refreshToken, expiresIn: 15 * 60 };
  }

  async me(usuarioId: string, empresaAtivaId: string) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
    });

    const vinculos = await this.prisma.withUsuario(usuarioId, (tx) =>
      tx.usuarioEmpresa.findMany({
        where: { usuarioId, ativo: true },
        include: { empresa: true },
      }),
    );

    // "perfis" é global (sem RLS) — o withTenant aqui não é por causa do
    // perfil, e sim de reaproveitar o mesmo helper de transação por vínculo.
    const perfis = await Promise.all(
      vinculos.map((v) =>
        this.prisma.withTenant(v.empresaId, (tx) =>
          tx.perfil.findUniqueOrThrow({
            where: { id: v.perfilId },
            select: { nome: true },
          }),
        ),
      ),
    );

    const ativo = vinculos.find((v) => v.empresaId === empresaAtivaId);
    const permissoes = ativo
      ? (
          await this.prisma.perfilPermissao.findMany({
            where: { perfilId: ativo.perfilId, permitido: true },
            include: { rotina: true },
          })
        ).map((p) => `${p.rotina.codigo}.${p.acao}`)
      : [];

    const mustChangePassword = await this.computeMustChangePassword(usuario);

    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      empresaAtivaId,
      empresas: vinculos.map((v, i) => ({
        empresaId: v.empresaId,
        nomeFantasia: v.empresa.nomeFantasia,
        logoUrl: v.empresa.logoUrl,
        bannerAtivo: v.empresa.bannerAtivo,
        bannerCor: v.empresa.bannerCor,
        bannerImagemUrl: v.empresa.bannerImagemUrl,
        perfilId: v.perfilId,
        perfilNome: perfis[i].nome,
      })),
      permissoes,
      mustChangePassword,
    };
  }

  async updateOwnProfile(usuarioId: string, empresaAtivaId: string, nome: string) {
    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { nome: nome.trim(), updatedBy: usuarioId },
    });
    return this.me(usuarioId, empresaAtivaId);
  }

  /** Troca a senha do próprio usuário logado, exigindo a senha atual. */
  async changePassword(usuarioId: string, input: ChangePasswordInput) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
    });

    const senhaAtualValida = await bcrypt.compare(input.senhaAtual, usuario.senhaHash);
    if (!senhaAtualValida) {
      throw new UnauthorizedException('Senha atual incorreta');
    }

    await this.politicaSenhaService.validarSenhaDoUsuario(
      usuarioId,
      input.novaSenha,
    );
    await this.politicaSenhaService.validarReuso(usuarioId, input.novaSenha, usuario.senhaHash);

    const novoHash = await bcrypt.hash(input.novaSenha, SALT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      await this.politicaSenhaService.registrarHistorico(usuarioId, usuario.senhaHash, tx);
      await tx.usuario.update({
        where: { id: usuarioId },
        data: {
          senhaHash: novoHash,
          senhaAlteradaEm: new Date(),
          deveTrocarSenha: false,
          tentativasFalhas: 0,
          bloqueadoAte: null,
        },
      });
    });

    return { success: true };
  }
}
