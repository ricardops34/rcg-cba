import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { dadosDoVendedor } from '../../common/usuarios/dados-do-vendedor';
import { montarEmailAcesso } from '../../common/mail/email-acesso';
import { buscarEmpresaDoEmail } from '../../common/mail/email-layout';
import { smtpDaEmpresa } from '../../common/mail/smtp-da-empresa';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import { PoliticaSenhaService } from '../politica-senha/politica-senha.service';
import { MailService } from '../../common/mail/mail.service';
import { SmsService, primeiroCelular, textoSms } from '../sms/sms.service';
import { linkDeAcesso } from '../../common/mail/email-acesso';
import { ParametrosService } from '../parametros/parametros.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  VendedorCreate,
  VendedorQuery,
  VendedorUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { grupoDaEmpresa } from '../../common/perfil/perfil-do-grupo';

// Campos que a listagem aceita ordenar por — whitelist pra não repassar
// direto pro Prisma um sortBy arbitrário vindo da query string.
const SORT_FIELDS = new Set([
  'nome',
  'codigoErp',
  'email',
  'ativo',
  'createdAt',
]);
const SALT_ROUNDS = 12;

@Injectable()
export class VendedoresService {
  private readonly logger = new Logger(VendedoresService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly politicaSenhaService: PoliticaSenhaService,
    private readonly mailService: MailService,
    private readonly parametros: ParametrosService,
    private readonly sms: SmsService,
  ) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    // Campos string vazios do formulário viram null no banco.
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  /**
   * O vendedor que **este usuário é** — não a lista que ele enxerga.
   *
   * Diferente de `resolverEscopoVendedores`, que responde "o que ele pode
   * ver": supervisor recebe a equipe, e admin recebe a empresa inteira. Aqui a
   * resposta é sempre uma pessoa só, e é isso que o agente de IA usa para se
   * limitar à carteira de quem pergunta (ver `agente-tools.service.ts`).
   *
   * Devolve `null` quando não há vínculo — usuário administrativo, financeiro
   * ou um administrador que não vende. Quem chama decide o que fazer com isso.
   */
  vendedorDoUsuario(empresaId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.vendedor.findFirst({
        where: { usuarioId: user.id, empresaId, deletedAt: null },
        select: { id: true, nome: true, nomeReduzido: true, tipo: true },
      }),
    );
  }

  findAll(empresaId: string, query: VendedorQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.tipo ? { tipo: query.tipo } : {}),
        ...(query.vinculo ? { vinculo: query.vinculo } : {}),
        ...(query.usaDashboard !== undefined
          ? { usaDashboard: query.usaDashboard }
          : {}),
        ...(query.desligado !== undefined
          ? { desligado: query.desligado }
          : {}),
        ...(query.superiorId ? { superiorId: query.superiorId } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  nome: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  codigoErp: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  email: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      };
      const sortField =
        query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'nome';
      const [data, total] = await Promise.all([
        tx.vendedor.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.vendedor.count({ where }),
      ]);

      // Tamanho da carteira de cada vendedor da página, separando cliente
      // ativo de inativo — é o que a listagem mostra na coluna "Clientes".
      //
      // PENDENTE: cliente PJ com CNPJ baixado não deve entrar nesta conta (a
      // carteira real não o inclui). O corte sai da `situacao_cadastral_id` do
      // legado, que ainda não foi trazida para cá — quando o campo existir,
      // basta somar a condição ao `where` abaixo. O `motivo_bloqueio` do
      // legado não serve: é uma letra sem tabela de descrição preenchida.
      const contagens = await tx.cliente.groupBy({
        by: ['vendedorId', 'ativo'],
        where: {
          empresaId,
          deletedAt: null,
          vendedorId: { in: data.map((v) => v.id) },
        },
        _count: { _all: true },
      });
      const carteira = new Map<string, { ativos: number; inativos: number }>();
      for (const c of contagens) {
        if (!c.vendedorId) continue;
        const atual = carteira.get(c.vendedorId) ?? { ativos: 0, inativos: 0 };
        if (c.ativo) atual.ativos += c._count._all;
        else atual.inativos += c._count._all;
        carteira.set(c.vendedorId, atual);
      }

      return buildPaginatedResult(
        data.map((v) => ({
          ...v,
          clientesAtivos: carteira.get(v.id)?.ativos ?? 0,
          clientesInativos: carteira.get(v.id)?.inativos ?? 0,
        })),
        total,
        query,
      );
    });
  }

  async findOne(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await tx.vendedor.findFirst({
        where: { id, empresaId, deletedAt: null },
      });
      if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
      return vendedor;
    });
  }

  /**
   * `desligado` é o controle de saída do vendedor: é ele que a tela mostra, e
   * `ativo` o acompanha. Sem esse espelho, um vendedor desligado continuaria
   * aparecendo em todo select do sistema, que filtra por `ativo`.
   *
   * Marcar `ativo` diretamente (pela API de integração, por exemplo) continua
   * valendo enquanto `desligado` não vier na mesma gravação.
   */
  private espelharDesligado<T extends Record<string, unknown>>(dados: T) {
    if (dados.desligado === undefined) return dados;
    return { ...dados, ativo: dados.desligado !== true };
  }

  /**
   * Impede ciclo na hierarquia: A responde a B, B responde a A.
   *
   * A hierarquia é um ponteiro só (`superiorId`) e sem teto de níveis, então o
   * risco real não é o óbvio (apontar para si mesmo), e sim o de três ou
   * quatro degraus que se fecham — e um ciclo trava, por definição, quem sobe
   * a cadeia. A consulta recursiva do escopo sobrevive (usa `UNION`, que não
   * reexpande nó repetido), mas o organograma fica sem topo e ninguém entende
   * por quê. Barrar na gravação é onde dá para explicar o que houve.
   *
   * Sobe do superior escolhido até o topo; se encontrar o próprio cadastro no
   * caminho, recusa.
   */
  private async garantirHierarquiaSemCiclo(
    tx: TenantTx,
    empresaId: string,
    id: string,
    superiorId: string | null | undefined,
  ) {
    if (!superiorId) return;
    if (superiorId === id) {
      throw new BadRequestException(
        'O vendedor não pode ser superior de si mesmo.',
      );
    }

    let atual: string | null = superiorId;
    // O teto existe para o caso de já haver ciclo gravado (dado antigo): sem
    // ele, esta subida seria o laço infinito que ela veio evitar.
    for (let degrau = 0; atual && degrau < 50; degrau++) {
      const acima: { superiorId: string | null } | null =
        await tx.vendedor.findFirst({
          where: { id: atual, empresaId, deletedAt: null },
          select: { superiorId: true },
        });
      if (!acima) return;
      if (acima.superiorId === id) {
        throw new BadRequestException(
          'Hierarquia circular: o superior escolhido responde, direta ou indiretamente, a este vendedor.',
        );
      }
      atual = acima.superiorId;
    }
  }

  async create(
    empresaId: string,
    user: AuthenticatedUser,
    input: VendedorCreate,
  ) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.vendedor.create({
        data: {
          ...(this.espelharDesligado(this.limpar(input)) as object),
          empresaId,
          createdBy: user.id,
          updatedBy: user.id,
        } as never,
      }),
    );
  }

  async update(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    input: VendedorUpdate,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await tx.vendedor.findFirst({
        where: { id, empresaId, deletedAt: null },
      });
      if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
      if (input.superiorId !== undefined) {
        await this.garantirHierarquiaSemCiclo(
          tx,
          empresaId,
          id,
          input.superiorId,
        );
      }
      return tx.vendedor.update({
        where: { id },
        data: {
          ...(this.espelharDesligado(this.limpar(input)) as object),
          updatedBy: user.id,
        } as never,
      });
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await tx.vendedor.findFirst({
        where: { id, empresaId, deletedAt: null },
      });
      if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
      return tx.vendedor.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
    });
  }

  /**
   * Cria um Usuario de acesso para o vendedor, com o perfil "Vendedor"
   * (o do grupo econômico, ou o da plataforma) e senha provisória enviada por e-mail. Tudo dentro de uma única
   * transação — se o e-mail falhar, a exceção propaga e o Prisma desfaz a
   * criação do usuário/vínculo (não fica usuário órfão sem senha comunicada).
   */
  async criarUsuario(empresaId: string, actorId: string, id: string) {
    const criado = await this.prisma.withTenant(
      empresaId,
      async (tx) => {
        const vendedor = await tx.vendedor.findFirst({
          where: { id, empresaId, deletedAt: null },
        });
        if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
        if (vendedor.usuarioId) {
          throw new ConflictException('Vendedor já possui usuário vinculado');
        }
        if (!vendedor.email) {
          throw new BadRequestException(
            'Cadastre um e-mail para o vendedor antes de criar o usuário',
          );
        }

        // Modo sistema: o e-mail é único na base inteira, não só no grupo.
        const email = vendedor.email;
        const existente = await this.prisma.withSistema((s) =>
          s.usuario.findUnique({ where: { email }, select: { id: true } }),
        );
        if (existente) {
          throw new ConflictException(
            'Já existe um usuário cadastrado com este e-mail',
          );
        }

        // O "Vendedor" do grupo da empresa, se ele tiver o seu; senão o da
        // plataforma. A RLS de perfis (withTenant acima) já esconde os de
        // outros grupos; a ordem põe o do grupo (não nulo) na frente.
        const perfilVendedor = await tx.perfil.findFirst({
          where: { nome: 'Vendedor', deletedAt: null },
          orderBy: { grupoEconomicoId: { sort: 'asc', nulls: 'last' } },
        });
        if (!perfilVendedor) {
          throw new NotFoundException(
            'Perfil "Vendedor" não encontrado — verifique o cadastro de perfis',
          );
        }

        const senha =
          await this.politicaSenhaService.gerarSenhaProvisoria(empresaId);
        const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);

        const usuario = await tx.usuario.create({
          data: {
            nome: vendedor.nome,
            email: vendedor.email,
            ...dadosDoVendedor([vendedor]),
            senhaHash,
            ativo: true,
            deveTrocarSenha: true,
            senhaAlteradaEm: new Date(),
            // Perfil e grupo são do usuário; o vínculo é só o acesso.
            perfilId: perfilVendedor.id,
            grupoEconomicoId: await grupoDaEmpresa(tx, empresaId),
            createdBy: actorId,
            updatedBy: actorId,
            usuarioEmpresas: {
              create: {
                empresaId,
                createdBy: actorId,
                updatedBy: actorId,
              },
            },
          },
        });

        await tx.vendedor.update({
          where: { id },
          data: { usuarioId: usuario.id, updatedBy: actorId },
        });

        return {
          usuario,
          email: vendedor.email,
          nome: vendedor.nome,
          senha,
          vendedorId: vendedor.id,
          telefone: vendedor.telefone,
        };
      },
      { timeout: 15_000 },
    );

    // Envio fica FORA da transação de propósito: SMTP indisponível derrubava
    // a transação inteira e o usuário nem chegava a ser criado. O acesso é o
    // que importa; o e-mail é entrega, e pode ser refeito por "Reenviar senha".
    const emailCriado = montarEmailAcesso({
      empresa: await buscarEmpresaDoEmail(this.prisma, empresaId),
      nome: criado.nome,
      login: criado.email,
      senha: criado.senha,
      motivo: 'criado',
    });
    const emailEnviado = await this.enviarSenhaPorEmail(
      empresaId,
      criado.email,
      emailCriado.assunto,
      emailCriado.html,
    );

    const smsEnviado = await this.enviarSenhaPorSms(empresaId, {
      vendedorId: criado.vendedorId,
      telefone: criado.telefone,
      login: criado.email,
      senha: criado.senha,
      autor: actorId,
    });

    return {
      id: criado.usuario.id,
      nome: criado.usuario.nome,
      email: criado.usuario.email,
      emailEnviado,
      smsEnviado,
      // Sem e-mail nem SMS entregue, ninguém saberia a senha e o acesso
      // nasceria inutilizável. Devolve só nesse caso, para o admin repassar —
      // mesmo princípio da chave de integração, exibida uma única vez.
      senhaProvisoria: emailEnviado || smsEnviado ? undefined : criado.senha,
    };
  }

  /**
   * Envia o e-mail sem deixar a falha derrubar a operação — devolve se saiu.
   * Sem SMTP configurado nem tenta (o MailService avisa e devolve false);
   * servidor fora do ar é problema de entrega, não motivo para desfazer um
   * acesso já criado.
   */
  /**
   * Senha provisória também por SMS, para o celular do vendedor — quando o
   * e-mail não chega, o SMS chega. Como o e-mail, falha não desfaz o acesso.
   * Não entra no histórico de atendimento: não é atendimento de cliente.
   */
  private async enviarSenhaPorSms(
    empresaId: string,
    dados: {
      vendedorId: string;
      telefone: string | null;
      login: string;
      senha: string;
      autor: string;
    },
  ): Promise<boolean> {
    const celular = primeiroCelular(dados.telefone);
    if (!celular || !(await this.sms.configurado(empresaId))) return false;
    const empresa = await buscarEmpresaDoEmail(this.prisma, empresaId);
    const link = linkDeAcesso(empresa.alias);
    return this.sms.tentar({
      empresaId,
      motivo: 'senha_provisoria',
      celular,
      mensagem: textoSms(
        `${empresa.nomeFantasia}: acesso a plataforma. Login: ${dados.login} Senha provisoria: ${dados.senha}` +
          (link ? ` Acesse: ${link}` : ''),
      ),
      vendedorId: dados.vendedorId,
      autor: dados.autor,
    });
  }

  private async enviarSenhaPorEmail(
    empresaId: string,
    para: string,
    assunto: string,
    html: string,
  ): Promise<boolean> {
    const smtp = await smtpDaEmpresa(this.parametros, empresaId);
    if (!this.mailService.configurado(smtp)) return false;
    try {
      return await this.mailService.send(para, assunto, html, smtp);
    } catch (erro) {
      this.logger.error(
        `Falha ao enviar senha provisória para ${para}: ${(erro as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Gera uma nova senha provisória para o usuário já vinculado ao vendedor
   * e reenvia por e-mail — mesmo fluxo de `criarUsuario`, mas para quem já
   * tem acesso e esqueceu/perdeu a senha original.
   */
  async reenviarSenha(empresaId: string, actorId: string, id: string) {
    const redefinida = await this.prisma.withTenant(
      empresaId,
      async (tx) => {
        const vendedor = await tx.vendedor.findFirst({
          where: { id, empresaId, deletedAt: null },
        });
        if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
        if (!vendedor.usuarioId) {
          throw new BadRequestException(
            'Vendedor não possui usuário de acesso associado',
          );
        }

        const usuario = await tx.usuario.findFirst({
          where: { id: vendedor.usuarioId, deletedAt: null },
        });
        if (!usuario)
          throw new NotFoundException('Usuário do vendedor não encontrado');
        if (!vendedor.email) {
          throw new BadRequestException(
            'Cadastre um e-mail para o vendedor antes de reenviar a senha',
          );
        }

        const senha =
          await this.politicaSenhaService.gerarSenhaProvisoria(empresaId);
        const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);

        await this.politicaSenhaService.registrarHistorico(
          usuario.id,
          usuario.senhaHash,
          tx,
        );
        await tx.usuario.update({
          where: { id: usuario.id },
          data: {
            senhaHash,
            senhaAlteradaEm: new Date(),
            deveTrocarSenha: true,
            tentativasFalhas: 0,
            bloqueadoAte: null,
            updatedBy: actorId,
          },
        });

        return {
          email: vendedor.email,
          nome: vendedor.nome,
          senha,
          vendedorId: vendedor.id,
          telefone: vendedor.telefone,
        };
      },
      { timeout: 15_000 },
    );

    // Mesma razão de criarUsuario: a senha já foi trocada no banco, então
    // falha de SMTP não pode desfazer a operação (nem deixar o vendedor com a
    // senha antiga, que já não vale mais).
    const emailRedefinida = montarEmailAcesso({
      empresa: await buscarEmpresaDoEmail(this.prisma, empresaId),
      nome: redefinida.nome,
      login: redefinida.email,
      senha: redefinida.senha,
      motivo: 'redefinida',
    });
    const emailEnviado = await this.enviarSenhaPorEmail(
      empresaId,
      redefinida.email,
      emailRedefinida.assunto,
      emailRedefinida.html,
    );

    const smsEnviado = await this.enviarSenhaPorSms(empresaId, {
      vendedorId: redefinida.vendedorId,
      telefone: redefinida.telefone,
      login: redefinida.email,
      senha: redefinida.senha,
      autor: actorId,
    });

    return {
      success: true,
      emailEnviado,
      smsEnviado,
      senhaProvisoria:
        emailEnviado || smsEnviado ? undefined : redefinida.senha,
    };
  }

  /**
   * Bloqueia o vendedor (ativo = false). Se houver usuário de acesso
   * vinculado, bloqueia o usuário junto — um vendedor bloqueado não deve
   * continuar conseguindo logar na plataforma.
   */
  async bloquear(empresaId: string, actorId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await tx.vendedor.findFirst({
        where: { id, empresaId, deletedAt: null },
      });
      if (!vendedor) throw new NotFoundException('Vendedor não encontrado');

      const atualizado = await tx.vendedor.update({
        where: { id },
        data: { ativo: false, updatedBy: actorId },
      });

      if (vendedor.usuarioId) {
        await tx.usuario.update({
          where: { id: vendedor.usuarioId },
          data: { ativo: false, updatedBy: actorId },
        });
      }

      return atualizado;
    });
  }

  /** Reverte o bloqueio: reativa o vendedor e, se houver, o usuário vinculado. */
  async desbloquear(empresaId: string, actorId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await tx.vendedor.findFirst({
        where: { id, empresaId, deletedAt: null },
      });
      if (!vendedor) throw new NotFoundException('Vendedor não encontrado');

      const atualizado = await tx.vendedor.update({
        where: { id },
        data: { ativo: true, updatedBy: actorId },
      });

      if (vendedor.usuarioId) {
        await tx.usuario.update({
          where: { id: vendedor.usuarioId },
          data: { ativo: true, updatedBy: actorId },
        });
      }

      return atualizado;
    });
  }
}
