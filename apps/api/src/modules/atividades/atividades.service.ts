import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, type TenantTx } from '../../common/prisma/prisma.service';
import {
  combinarFiltroVendedor,
  resolverEscopoVendedores,
  type EscopoVendedores,
} from '../../common/escopo/escopo-vendedores';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  AtividadeCreate,
  AtividadeQuery,
  AtividadeUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const SORT_FIELDS = new Set([
  'titulo',
  'tipo',
  'dataVencimento',
  'concluida',
  'ativo',
  'createdAt',
]);

const CLIENTE_SELECT = {
  select: { id: true, razaoSocial: true, nomeFantasia: true },
};
const VENDEDOR_SELECT = { select: { id: true, nome: true, nomeReduzido: true } };
const OPORTUNIDADE_SELECT = { select: { id: true, titulo: true } };
const ORCAMENTO_SELECT = { select: { id: true, titulo: true } };
const INCLUDE = {
  cliente: CLIENTE_SELECT,
  vendedor: VENDEDOR_SELECT,
  oportunidade: OPORTUNIDADE_SELECT,
  orcamento: ORCAMENTO_SELECT,
};

@Injectable()
export class AtividadesService {
  constructor(private readonly prisma: PrismaService) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  private garantirVendedorNoEscopo(escopo: EscopoVendedores, vendedorId: string) {
    if (escopo !== null && !escopo.includes(vendedorId)) {
      throw new NotFoundException('Vendedor fora do seu escopo');
    }
  }

  private async garantirClienteNoEscopo(
    tx: TenantTx,
    empresaId: string,
    escopo: EscopoVendedores,
    clienteId: string,
  ) {
    const cliente = await tx.cliente.findFirst({
      where: { id: clienteId, empresaId, deletedAt: null },
      select: { vendedorId: true },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    if (escopo !== null && (!cliente.vendedorId || !escopo.includes(cliente.vendedorId))) {
      throw new NotFoundException('Cliente fora do seu escopo');
    }
  }

  private async garantirOportunidadeNoEscopo(
    tx: TenantTx,
    empresaId: string,
    escopo: EscopoVendedores,
    oportunidadeId: string,
  ) {
    const oportunidade = await tx.oportunidade.findFirst({
      where: { id: oportunidadeId, empresaId, deletedAt: null },
      select: { vendedorId: true },
    });
    if (!oportunidade) throw new NotFoundException('Oportunidade não encontrada');
    if (escopo !== null && !escopo.includes(oportunidade.vendedorId)) {
      throw new NotFoundException('Oportunidade fora do seu escopo');
    }
  }

  private async garantirOrcamentoNoEscopo(
    tx: TenantTx,
    empresaId: string,
    escopo: EscopoVendedores,
    orcamentoId: string,
  ) {
    const orcamento = await tx.orcamento.findFirst({
      where: { id: orcamentoId, empresaId, deletedAt: null },
      select: { vendedorId: true },
    });
    if (!orcamento) throw new NotFoundException('Orçamento não encontrado');
    if (escopo !== null && !escopo.includes(orcamento.vendedorId)) {
      throw new NotFoundException('Orçamento fora do seu escopo');
    }
  }

  /** Marcar concluída seta a data de conclusão (se não informada); reabrir limpa. */
  private normalizarConclusao<T extends { concluida?: boolean; dataConclusao?: Date | null }>(
    input: T,
  ) {
    if (input.concluida === true && !input.dataConclusao) {
      return { ...input, dataConclusao: new Date() };
    }
    if (input.concluida === false) {
      return { ...input, dataConclusao: null };
    }
    return input;
  }

  findAll(empresaId: string, user: AuthenticatedUser, query: AtividadeQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const where = {
        empresaId,
        deletedAt: null,
        ...combinarFiltroVendedor(escopo, query.vendedorId),
        ...(query.clienteId ? { clienteId: query.clienteId } : {}),
        ...(query.oportunidadeId ? { oportunidadeId: query.oportunidadeId } : {}),
        ...(query.orcamentoId ? { orcamentoId: query.orcamentoId } : {}),
        ...(query.tipo ? { tipo: query.tipo } : {}),
        ...(query.concluida !== undefined ? { concluida: query.concluida } : {}),
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.vencidas
          ? { concluida: false, dataVencimento: { lt: new Date() } }
          : {}),
        ...(query.dataInicio || query.dataFim
          ? {
              dataVencimento: {
                ...(query.dataInicio ? { gte: query.dataInicio } : {}),
                ...(query.dataFim ? { lte: query.dataFim } : {}),
              },
            }
          : {}),
        ...(query.search
          ? { titulo: { contains: query.search, mode: 'insensitive' as const } }
          : {}),
      };
      const sortField =
        query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'dataVencimento';
      const [data, total] = await Promise.all([
        tx.atividade.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.atividade.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const atividade = await tx.atividade.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
        include: INCLUDE,
      });
      if (!atividade) throw new NotFoundException('Atividade não encontrada');
      return atividade;
    });
  }

  /**
   * O vendedor que **este usuário é** — não a lista que ele enxerga.
   *
   * A tela pede o vendedor num select; o agente não tem select, e "agende um
   * retorno para sexta" quer dizer na agenda de quem pediu. Supervisor que
   * queira agendar para um subordinado informa o vendedor explicitamente, e aí
   * o `garantirVendedorNoEscopo` do `create` continua valendo.
   *
   * Usuário sem cadastro de vendedor (financeiro, administrativo) não tem
   * agenda: melhor dizer isso do que criar a atividade órfã de alguém.
   */
  async vendedorDoUsuario(empresaId: string, user: AuthenticatedUser) {
    const vendedor = await this.prisma.withTenant(empresaId, (tx) =>
      tx.vendedor.findFirst({
        where: { usuarioId: user.id, empresaId, deletedAt: null },
        select: { id: true, nome: true },
      }),
    );
    if (!vendedor) {
      throw new NotFoundException(
        'Seu usuário não está vinculado a um vendedor, então não há agenda para lançar. ' +
          'Peça ao administrador para fazer o vínculo em Cadastros > Vendedores.',
      );
    }
    return vendedor;
  }

  create(empresaId: string, user: AuthenticatedUser, input: AtividadeCreate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      this.garantirVendedorNoEscopo(escopo, input.vendedorId);
      if (input.clienteId) await this.garantirClienteNoEscopo(tx, empresaId, escopo, input.clienteId);
      if (input.oportunidadeId) {
        await this.garantirOportunidadeNoEscopo(tx, empresaId, escopo, input.oportunidadeId);
      }
      if (input.orcamentoId) {
        await this.garantirOrcamentoNoEscopo(tx, empresaId, escopo, input.orcamentoId);
      }

      return tx.atividade.create({
        data: {
          ...(this.limpar(this.normalizarConclusao(input)) as object),
          empresaId,
          createdBy: user.id,
          updatedBy: user.id,
        } as never,
        include: INCLUDE,
      });
    });
  }

  async update(empresaId: string, user: AuthenticatedUser, id: string, input: AtividadeUpdate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const atividade = await tx.atividade.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
      });
      if (!atividade) throw new NotFoundException('Atividade não encontrada');

      if (input.vendedorId) this.garantirVendedorNoEscopo(escopo, input.vendedorId);
      if (input.clienteId) await this.garantirClienteNoEscopo(tx, empresaId, escopo, input.clienteId);
      if (input.oportunidadeId) {
        await this.garantirOportunidadeNoEscopo(tx, empresaId, escopo, input.oportunidadeId);
      }
      if (input.orcamentoId) {
        await this.garantirOrcamentoNoEscopo(tx, empresaId, escopo, input.orcamentoId);
      }

      return tx.atividade.update({
        where: { id },
        data: {
          ...(this.limpar(this.normalizarConclusao(input)) as object),
          updatedBy: user.id,
        } as never,
        include: INCLUDE,
      });
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const atividade = await tx.atividade.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
      });
      if (!atividade) throw new NotFoundException('Atividade não encontrada');
      return tx.atividade.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
    });
  }
}
