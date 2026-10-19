import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import { diaLocal } from '../../common/horario/expediente';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  orcamentoExigeAutorizacao,
  registrarAtividadeOrcamento,
} from './registrar-atividade-orcamento';

export type DecisaoLink = 'aprovado' | 'recusado';

export interface OrigemDecisaoLink {
  ip: string | null;
  agente: string | null;
}

type Situacao =
  'aberto' | 'aprovado' | 'recusado' | 'revogado' | 'vencido' | 'pendente';

const MOTIVO: Record<Exclude<Situacao, 'aberto'>, string> = {
  aprovado: 'Este orçamento já foi respondido',
  recusado: 'Este orçamento já foi respondido',
  revogado: 'Este link não está mais disponível — peça um novo ao vendedor',
  vencido: 'O orçamento está vencido',
  pendente: 'O orçamento está em análise — fale com o vendedor',
};

type LinkRow = {
  id: string;
  empresaId: string;
  orcamentoId: string;
  revogadoEm: Date | null;
};

/**
 * Link público do orçamento (docs/planos/orcamento-link-publico.md): o vendedor
 * gera, leva ao cliente por fora (e-mail, WhatsApp...) e o cliente aprova ou
 * recusa sem login. Uma resposta só, e só dentro da validade do orçamento.
 *
 * O token carrega a empresa (`<empresaId>.<aleatório>`) porque a RLS exige a
 * empresa para ler qualquer coisa: sem usuário logado, é o único jeito de abrir
 * a transação do tenant certo. Quem adivinhar a empresa ainda precisa dos 32
 * bytes aleatórios.
 */
@Injectable()
export class OrcamentoLinkService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- vendedor

  /** Link ativo do orçamento, ou nulo. Não gera nada. */
  async obter(empresaId: string, user: AuthenticatedUser, orcamentoId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.buscarNoEscopo(tx, empresaId, user, orcamentoId);
      return this.linkAtivo(tx, empresaId, orcamentoId);
    });
  }

  /**
   * Gera (ou devolve) o link do orçamento. Recusa orçamento com pendência — o
   * desconto acima do máximo da regra sem autorização — e o que já não aceita
   * resposta. Passar de rascunho para enviado é consequência: o link só decide
   * orçamento enviado.
   */
  async gerar(empresaId: string, user: AuthenticatedUser, orcamentoId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const orc = await this.buscarNoEscopo(tx, empresaId, user, orcamentoId);
      if (orc.status !== 'rascunho' && orc.status !== 'enviado') {
        throw new ConflictException(
          'Só orçamento em rascunho ou enviado pode ter link para o cliente',
        );
      }
      if (orc.dataValidade && this.venceu(orc.dataValidade)) {
        throw new ConflictException(
          'Orçamento vencido — faça uma cópia para gerar um novo',
        );
      }
      const itens = await tx.orcamentoItem.count({ where: { orcamentoId } });
      if (itens === 0) {
        throw new ConflictException('Orçamento sem itens não pode ser enviado');
      }
      if (
        !orc.descontoAutorizadoEm &&
        (await orcamentoExigeAutorizacao(tx, orcamentoId))
      ) {
        throw new ConflictException(
          'Orçamento com desconto igual ou acima do máximo da regra — ' +
            'solicite a autorização de desconto antes de gerar o link',
        );
      }

      const existente = await this.linkAtivo(tx, empresaId, orcamentoId);
      if (existente) return existente;

      const token = `${empresaId}.${randomBytes(32).toString('base64url')}`;
      await tx.orcamentoLink.create({
        data: {
          empresaId,
          orcamentoId,
          token,
          expiraEm: orc.dataValidade,
          createdBy: user.id,
        },
      });
      if (orc.status === 'rascunho') {
        await tx.orcamento.update({
          where: { id: orcamentoId },
          data: { status: 'enviado', updatedBy: user.id },
        });
      }
      await registrarAtividadeOrcamento(
        tx,
        empresaId,
        user.id,
        'link_gerado',
        orc,
      );
      return { token, expiraEm: orc.dataValidade, usadoEm: null };
    });
  }

  async revogar(
    empresaId: string,
    user: AuthenticatedUser,
    orcamentoId: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.buscarNoEscopo(tx, empresaId, user, orcamentoId);
      await this.revogarDoOrcamento(tx, orcamentoId);
      return { ok: true };
    });
  }

  /** Chamado quando o orçamento é alterado: o que o cliente viu deixou de valer. */
  async revogarDoOrcamento(tx: TenantTx, orcamentoId: string) {
    await tx.orcamentoLink.updateMany({
      where: { orcamentoId, revogadoEm: null },
      data: { revogadoEm: new Date() },
    });
  }

  // ----------------------------------------------------------------- cliente

  async ver(token: string) {
    return this.comLink(token, async (tx, link) => {
      const { descontoAutorizadoEm, ...publico } =
        await tx.orcamento.findFirstOrThrow({
          where: { id: link.orcamentoId, empresaId: link.empresaId },
          select: {
            id: true,
            numero: true,
            codigoErp: true,
            titulo: true,
            status: true,
            dataValidade: true,
            observacao: true,
            vlrTotal: true,
            clienteDecisao: true,
            clienteDecididoEm: true,
            clienteDecisaoObservacao: true,
            descontoAutorizadoEm: true,
            empresa: {
              select: { nomeFantasia: true, razaoSocial: true, logoUrl: true },
            },
            cliente: { select: { razaoSocial: true, nomeFantasia: true } },
            vendedor: { select: { nome: true } },
            condicaoPagamento: { select: { descricao: true } },
            itens: {
              select: {
                id: true,
                quantidade: true,
                vlrUnitario: true,
                percDesconto: true,
                vlrTotal: true,
                produto: { select: { codigoErp: true, descricao: true } },
              },
            },
          },
        });
      const situacao = await this.situacao(tx, link, {
        ...publico,
        descontoAutorizadoEm,
      });
      return { ...publico, situacao };
    });
  }

  async decidir(
    token: string,
    decisao: DecisaoLink,
    observacao: string | undefined,
    origem: OrigemDecisaoLink,
  ) {
    const justificativa = observacao?.trim() || null;
    if (decisao === 'recusado' && !justificativa) {
      throw new ConflictException('Informe a justificativa da recusa');
    }
    return this.comLink(token, async (tx, link) => {
      const orc = await tx.orcamento.findFirstOrThrow({
        where: { id: link.orcamentoId, empresaId: link.empresaId },
      });
      const situacao = await this.situacao(tx, link, orc);
      if (situacao !== 'aberto') throw new ConflictException(MOTIVO[situacao]);

      const agora = new Date();
      // updateMany com a condição de ainda estar sem resposta: dois cliques ao
      // mesmo tempo gravam um só.
      const { count } = await tx.orcamento.updateMany({
        where: { id: orc.id, status: 'enviado', clienteDecididoEm: null },
        data: {
          status: decisao,
          clienteDecididoEm: agora,
          clienteDecisao: decisao,
          clienteDecisaoObservacao: justificativa,
          clienteDecisaoCanal: 'link',
          clienteDecisaoIp: origem.ip?.slice(0, 64) ?? null,
          clienteDecisaoAgente: origem.agente?.slice(0, 300) ?? null,
          updatedBy: 'link-publico',
        },
      });
      if (count === 0) throw new ConflictException(MOTIVO.aprovado);
      await tx.orcamentoLink.update({
        where: { id: link.id },
        data: { usadoEm: agora },
      });
      await registrarAtividadeOrcamento(
        tx,
        link.empresaId,
        null,
        decisao === 'aprovado' ? 'aprovacao_cliente' : 'recusa_cliente',
        orc,
        `${justificativa ?? orc.titulo} (pelo link enviado ao cliente)`,
      );
      return { situacao: decisao };
    });
  }

  // ----------------------------------------------------------------- interno

  private async comLink<T>(
    token: string,
    fn: (tx: TenantTx, link: LinkRow) => Promise<T>,
  ): Promise<T> {
    const empresaId = token.split('.')[0];
    if (!/^[0-9a-f-]{36}$/.test(empresaId) || token.length > 200) {
      throw new NotFoundException('Link inválido');
    }
    return this.prisma.withTenant(empresaId, async (tx) => {
      const link = await tx.orcamentoLink.findUnique({ where: { token } });
      if (!link || link.empresaId !== empresaId) {
        throw new NotFoundException('Link inválido');
      }
      return fn(tx, link);
    });
  }

  private async situacao(
    tx: TenantTx,
    link: LinkRow,
    orc: {
      id: string;
      status: string;
      dataValidade: Date | null;
      descontoAutorizadoEm: Date | null;
    },
  ): Promise<Situacao> {
    if (orc.status === 'aprovado') return 'aprovado';
    if (orc.status === 'recusado') return 'recusado';
    if (link.revogadoEm) return 'revogado';
    if (
      orc.status === 'expirado' ||
      (orc.dataValidade && this.venceu(orc.dataValidade))
    ) {
      return 'vencido';
    }
    if (orc.status !== 'enviado') return 'revogado';
    if (
      !orc.descontoAutorizadoEm &&
      (await orcamentoExigeAutorizacao(tx, orc.id))
    ) {
      return 'pendente';
    }
    return 'aberto';
  }

  private venceu(dataValidade: Date): boolean {
    return dataValidade.toISOString().slice(0, 10) < diaLocal(new Date());
  }

  private async linkAtivo(
    tx: TenantTx,
    empresaId: string,
    orcamentoId: string,
  ) {
    const link = await tx.orcamentoLink.findFirst({
      where: { empresaId, orcamentoId, revogadoEm: null },
      orderBy: { createdAt: 'desc' },
    });
    return link
      ? { token: link.token, expiraEm: link.expiraEm, usadoEm: link.usadoEm }
      : null;
  }

  private async buscarNoEscopo(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
  ) {
    const escopo = await resolverEscopoVendedores(tx, empresaId, user);
    const orc = await tx.orcamento.findFirst({
      where: {
        id,
        empresaId,
        deletedAt: null,
        ...(escopo ? { vendedorId: { in: escopo } } : {}),
      },
    });
    if (!orc) throw new NotFoundException('Orçamento não encontrado');
    return orc;
  }
}
