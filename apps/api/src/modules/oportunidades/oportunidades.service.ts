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
  OportunidadeCreate,
  OportunidadeQuery,
  OportunidadeUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const SORT_FIELDS = new Set([
  'titulo',
  'estagio',
  'valorPrevisto',
  'dataPrevisao',
  'dataFechamento',
  'ativo',
  'createdAt',
]);

const CLIENTE_SELECT = {
  select: { id: true, razaoSocial: true, nomeFantasia: true },
};
const VENDEDOR_SELECT = { select: { id: true, nome: true, nomeReduzido: true } };
const INCLUDE = { cliente: CLIENTE_SELECT, vendedor: VENDEDOR_SELECT };

@Injectable()
export class OportunidadesService {
  constructor(private readonly prisma: PrismaService) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  /** Mover pra ganha/perdida seta a data de fechamento (se não informada). */
  private normalizarFechamento<T extends { estagio?: string; dataFechamento?: Date | null }>(
    input: T,
  ) {
    if ((input.estagio === 'ganha' || input.estagio === 'perdida') && !input.dataFechamento) {
      return { ...input, dataFechamento: new Date() };
    }
    return input;
  }

  private garantirVendedorNoEscopo(escopo: EscopoVendedores, vendedorId: string) {
    if (escopo !== null && !escopo.includes(vendedorId)) {
      throw new NotFoundException('Vendedor fora do seu escopo');
    }
  }

  /**
   * Confirma que o cliente existe e pertence à carteira do escopo do usuário
   * — evita criar oportunidade/atividade pra cliente fora da própria
   * carteira mesmo informando o id à mão.
   */
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

  findAll(empresaId: string, user: AuthenticatedUser, query: OportunidadeQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const where = {
        empresaId,
        deletedAt: null,
        ...combinarFiltroVendedor(escopo, query.vendedorId),
        ...(query.clienteId ? { clienteId: query.clienteId } : {}),
        ...(query.estagio ? { estagio: query.estagio } : {}),
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.search
          ? { titulo: { contains: query.search, mode: 'insensitive' as const } }
          : {}),
      };
      const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'createdAt';
      const [data, total] = await Promise.all([
        tx.oportunidade.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.oportunidade.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const oportunidade = await tx.oportunidade.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
        include: INCLUDE,
      });
      if (!oportunidade) throw new NotFoundException('Oportunidade não encontrada');
      return oportunidade;
    });
  }

  create(empresaId: string, user: AuthenticatedUser, input: OportunidadeCreate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      this.garantirVendedorNoEscopo(escopo, input.vendedorId);
      await this.garantirClienteNoEscopo(tx, empresaId, escopo, input.clienteId);

      return tx.oportunidade.create({
        data: {
          ...(this.limpar(this.normalizarFechamento(input)) as object),
          empresaId,
          createdBy: user.id,
          updatedBy: user.id,
        } as never,
        include: INCLUDE,
      });
    });
  }

  async update(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    input: OportunidadeUpdate,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const oportunidade = await tx.oportunidade.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
      });
      if (!oportunidade) throw new NotFoundException('Oportunidade não encontrada');

      if (input.vendedorId) this.garantirVendedorNoEscopo(escopo, input.vendedorId);
      if (input.clienteId) await this.garantirClienteNoEscopo(tx, empresaId, escopo, input.clienteId);

      return tx.oportunidade.update({
        where: { id },
        data: {
          ...(this.limpar(this.normalizarFechamento(input)) as object),
          updatedBy: user.id,
        } as never,
        include: INCLUDE,
      });
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const oportunidade = await tx.oportunidade.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
      });
      if (!oportunidade) throw new NotFoundException('Oportunidade não encontrada');
      return tx.oportunidade.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
    });
  }
}
