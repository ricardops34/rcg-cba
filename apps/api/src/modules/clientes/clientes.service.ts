import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, type TenantTx } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  ClienteCreate,
  ClienteQuery,
  ClienteUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

// Campos que a listagem aceita ordenar por — whitelist pra não repassar
// direto pro Prisma um sortBy arbitrário vindo da query string.
const SORT_FIELDS = new Set([
  'razaoSocial',
  'nomeFantasia',
  'codigoErp',
  'cnpjCpf',
  'municipio',
  'uf',
  'ativo',
  'createdAt',
]);

// Dados do vendedor anexados às respostas (coluna "Vendedor" da listagem).
const VENDEDOR_SELECT = { select: { id: true, nome: true, nomeReduzido: true } };

/**
 * null = sem restrição de carteira (admin, "Diretor" ou usuário sem Vendedor
 * vinculado, ex.: Administrativo). string[] = ids de Vendedor cujas carteiras
 * o usuário logado pode ver/mexer.
 */
type EscopoVendedores = string[] | null;

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    // Campos string vazios do formulário viram null no banco.
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  /**
   * Resolve o escopo hierárquico do usuário logado a partir do cadastro de
   * Vendedor (vínculo por usuarioId). Sem CTE recursiva: supervisorId e
   * gerenteId são campos diretos por linha do time todo, então uma query por
   * papel basta (ver docs/planos/clientes-crud.md).
   */
  private async resolverEscopoVendedores(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
  ): Promise<EscopoVendedores> {
    if (user.isAdmin) return null; // acesso total (cobre Administrador; "Diretor" tratado igual)

    const vendedor = await tx.vendedor.findFirst({
      where: { usuarioId: user.id, empresaId, deletedAt: null },
      select: { id: true, supervisor: true, gerente: true },
    });
    if (!vendedor) return null; // sem Vendedor vinculado (ex.: Administrativo) = acesso total

    if (vendedor.gerente) {
      const gerenciados = await tx.vendedor.findMany({
        where: { empresaId, gerenteId: vendedor.id, deletedAt: null },
        select: { id: true },
      });
      return [vendedor.id, ...gerenciados.map((v) => v.id)];
    }
    if (vendedor.supervisor) {
      const supervisionados = await tx.vendedor.findMany({
        where: { empresaId, supervisorId: vendedor.id, deletedAt: null },
        select: { id: true },
      });
      return [vendedor.id, ...supervisionados.map((v) => v.id)];
    }
    return [vendedor.id]; // vendedor "puro": só a própria carteira
  }

  /**
   * Combina o escopo com o filtro ?vendedorId= da query sem deixar o filtro
   * sobrescrever a restrição: um vendedorId fora do escopo força resultado
   * vazio em vez de vazar carteiras de fora do time.
   */
  private combinarFiltroVendedor(escopo: EscopoVendedores, vendedorIdQuery?: string) {
    if (escopo === null) return vendedorIdQuery ? { vendedorId: vendedorIdQuery } : {};
    if (!vendedorIdQuery) return { vendedorId: { in: escopo } };
    return {
      vendedorId: escopo.includes(vendedorIdQuery)
        ? vendedorIdQuery
        : { in: [] as string[] },
    };
  }

  /**
   * Impede atribuir um cliente a um vendedor fora do próprio time. Para
   * usuário restrito, vendedorId vazio também é rejeitado — um cliente sem
   * carteira ficaria invisível para o próprio autor.
   */
  private validarVendedorNoEscopo(
    escopo: EscopoVendedores,
    vendedorId: string | null | undefined,
  ) {
    if (escopo === null) return;
    if (vendedorId === undefined) return; // update parcial sem mexer no vendedor
    if (!vendedorId || !escopo.includes(vendedorId)) {
      throw new ForbiddenException('Vendedor fora do seu escopo de acesso');
    }
  }

  findAll(empresaId: string, user: AuthenticatedUser, query: ClienteQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await this.resolverEscopoVendedores(tx, empresaId, user);
      const where = {
        empresaId,
        deletedAt: null,
        ...this.combinarFiltroVendedor(escopo, query.vendedorId),
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.tipoPessoa ? { tipoPessoa: query.tipoPessoa } : {}),
        ...(query.uf ? { uf: query.uf } : {}),
        ...(query.carteira !== undefined ? { carteira: query.carteira } : {}),
        ...(query.search
          ? {
              OR: [
                { razaoSocial: { contains: query.search, mode: 'insensitive' as const } },
                { nomeFantasia: { contains: query.search, mode: 'insensitive' as const } },
                { codigoErp: { contains: query.search, mode: 'insensitive' as const } },
                { cnpjCpf: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };
      const sortField =
        query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'razaoSocial';
      const [data, total] = await Promise.all([
        tx.cliente.findMany({
          where,
          include: { vendedor: VENDEDOR_SELECT },
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.cliente.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await this.resolverEscopoVendedores(tx, empresaId, user);
      const cliente = await tx.cliente.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
        include: { vendedor: VENDEDOR_SELECT },
      });
      if (!cliente) throw new NotFoundException('Cliente não encontrado');
      return cliente;
    });
  }

  create(empresaId: string, user: AuthenticatedUser, input: ClienteCreate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await this.resolverEscopoVendedores(tx, empresaId, user);
      this.validarVendedorNoEscopo(escopo, input.vendedorId ?? null);
      return tx.cliente.create({
        data: {
          ...(this.limpar(input) as object),
          empresaId,
          createdBy: user.id,
          updatedBy: user.id,
        } as never,
      });
    });
  }

  async update(empresaId: string, user: AuthenticatedUser, id: string, input: ClienteUpdate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await this.resolverEscopoVendedores(tx, empresaId, user);
      const cliente = await tx.cliente.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
      });
      if (!cliente) throw new NotFoundException('Cliente não encontrado');
      this.validarVendedorNoEscopo(escopo, input.vendedorId);
      return tx.cliente.update({
        where: { id },
        data: { ...(this.limpar(input) as object), updatedBy: user.id } as never,
      });
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await this.resolverEscopoVendedores(tx, empresaId, user);
      const cliente = await tx.cliente.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
      });
      if (!cliente) throw new NotFoundException('Cliente não encontrado');
      return tx.cliente.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
    });
  }

  /**
   * Vendedores dentro do escopo do usuário logado — alimenta o filtro
   * "Vendedor" da listagem e o Select do formulário sem expor o
   * VendedoresController (que não tem restrição de carteira).
   */
  vendedoresEscopo(empresaId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await this.resolverEscopoVendedores(tx, empresaId, user);
      const data = await tx.vendedor.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ...(escopo ? { id: { in: escopo } } : {}),
        },
        orderBy: { nome: 'asc' },
      });
      return { data, restrito: escopo !== null };
    });
  }
}
