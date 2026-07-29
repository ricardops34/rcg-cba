import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, type TenantTx } from '../../common/prisma/prisma.service';
import {
  combinarFiltroVendedor,
  resolverEscopoVendedores,
} from '../../common/escopo/escopo-vendedores';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  ObjetivoDashboardQuery,
  ObjetivoVendedorMesCreate,
  ObjetivoVendedorMesQuery,
  ObjetivoVendedorMesUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const SORT_FIELDS = new Set(['ano', 'mes', 'valor', 'ativo', 'createdAt']);

const VENDEDOR_SELECT = { select: { id: true, nome: true, nomeReduzido: true } };
const CATEGORIA_LINHA_INCLUDE = {
  categorias: {
    where: { deletedAt: null },
    include: { categoria: { select: { codigoErp: true, descricao: true } } },
  },
};

@Injectable()
export class ObjetivosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, user: AuthenticatedUser, query: ObjetivoVendedorMesQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const where = {
        empresaId,
        deletedAt: null,
        ...combinarFiltroVendedor(escopo, query.vendedorId),
        ...(query.ano !== undefined ? { ano: query.ano } : {}),
        ...(query.mes !== undefined ? { mes: query.mes } : {}),
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      };
      const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'ano';
      const [data, total] = await Promise.all([
        tx.objetivoVendedorMes.findMany({
          where,
          include: { vendedor: VENDEDOR_SELECT, ...CATEGORIA_LINHA_INCLUDE },
          ...paginationToSkipTake(query),
          orderBy: [{ [sortField]: query.sortOrder }, { mes: 'desc' }],
        }),
        tx.objetivoVendedorMes.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const objetivo = await tx.objetivoVendedorMes.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
        include: { vendedor: VENDEDOR_SELECT, ...CATEGORIA_LINHA_INCLUDE },
      });
      if (!objetivo) throw new NotFoundException('Objetivo não encontrado');
      return objetivo;
    });
  }

  private garantirVendedorNoEscopo(escopo: string[] | null, vendedorId: string) {
    if (escopo !== null && !escopo.includes(vendedorId)) {
      throw new NotFoundException('Vendedor fora do seu escopo');
    }
  }

  private async garantirSemDuplicidade(
    tx: TenantTx,
    empresaId: string,
    vendedorId: string,
    mes: number,
    ano: number,
    ignorarId?: string,
  ) {
    const existente = await tx.objetivoVendedorMes.findFirst({
      where: {
        empresaId,
        vendedorId,
        mes,
        ano,
        deletedAt: null,
        ...(ignorarId ? { id: { not: ignorarId } } : {}),
      },
    });
    if (existente) {
      throw new ConflictException('Já existe objetivo para este vendedor neste mês/ano');
    }
  }

  create(empresaId: string, user: AuthenticatedUser, input: ObjetivoVendedorMesCreate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      this.garantirVendedorNoEscopo(escopo, input.vendedorId);
      await this.garantirSemDuplicidade(tx, empresaId, input.vendedorId, input.mes, input.ano);

      const { categorias, tipo, ...header } = input;
      const objetivo = await tx.objetivoVendedorMes.create({
        data: {
          ...header,
          tipo: tipo || null,
          empresaId,
          createdBy: user.id,
          updatedBy: user.id,
          categorias: {
            create: categorias.map((c) => ({ ...c, empresaId })),
          },
        },
        include: { vendedor: VENDEDOR_SELECT, ...CATEGORIA_LINHA_INCLUDE },
      });
      return objetivo;
    });
  }

  async update(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    input: ObjetivoVendedorMesUpdate,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const objetivo = await tx.objetivoVendedorMes.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
      });
      if (!objetivo) throw new NotFoundException('Objetivo não encontrado');

      const vendedorId = input.vendedorId ?? objetivo.vendedorId;
      const mes = input.mes ?? objetivo.mes;
      const ano = input.ano ?? objetivo.ano;
      if (input.vendedorId) this.garantirVendedorNoEscopo(escopo, input.vendedorId);
      await this.garantirSemDuplicidade(tx, empresaId, vendedorId, mes, ano, id);

      const { categorias, tipo, ...header } = input;
      if (categorias) {
        await tx.objetivoVendedorCategoria.deleteMany({ where: { objetivoVendedorMesId: id } });
      }
      return tx.objetivoVendedorMes.update({
        where: { id },
        data: {
          ...header,
          ...(tipo !== undefined ? { tipo: tipo || null } : {}),
          updatedBy: user.id,
          ...(categorias
            ? { categorias: { create: categorias.map((c) => ({ ...c, empresaId })) } }
            : {}),
        },
        include: { vendedor: VENDEDOR_SELECT, ...CATEGORIA_LINHA_INCLUDE },
      });
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const objetivo = await tx.objetivoVendedorMes.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
      });
      if (!objetivo) throw new NotFoundException('Objetivo não encontrado');
      return tx.objetivoVendedorMes.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
    });
  }

  /**
   * Dashboard Comercial: objetivo (ObjetivoVendedorMes/Categoria) vs realizado
   * (agregado ao vivo de notas_saida_itens), no escopo hierárquico do usuário
   * combinado com o vendedorId da query (omitido = agrega o escopo inteiro).
   * Realizado por item = vlrTotal − vlrDev (aproximação do vlr_liquido do
   * legado: o campo item-level vlr_bruto do legado não foi importado, só
   * vlr_total, que já é o valor líquido de desconto).
   */
  async dashboard(empresaId: string, user: AuthenticatedUser, query: ObjetivoDashboardQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const filtroVendedor = combinarFiltroVendedor(escopo, query.vendedorId);

      const objetivos = await tx.objetivoVendedorMes.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ativo: true,
          mes: query.mes,
          ano: query.ano,
          ...filtroVendedor,
        },
        include: { categorias: { where: { deletedAt: null } } },
      });
      const objetivoValor = objetivos.reduce((acc, o) => acc + o.valor, 0);
      const objetivoClientes = objetivos.reduce((acc, o) => acc + (o.numeroCliente ?? 0), 0);
      const objetivoPorCategoria = new Map<string, number>();
      for (const o of objetivos) {
        for (const c of o.categorias) {
          objetivoPorCategoria.set(
            c.categoriaId,
            (objetivoPorCategoria.get(c.categoriaId) ?? 0) + c.valor,
          );
        }
      }

      const itensWhere = {
        empresaId,
        deletedAt: null,
        ativo: true,
        ano: query.ano,
        mes: query.mes,
        ...filtroVendedor,
      };
      const [gruposPorProduto, clientesPositivadosGrupos, baseTotal] = await Promise.all([
        tx.notaSaidaItem.groupBy({
          by: ['produtoId'],
          where: itensWhere,
          _sum: { vlrTotal: true, vlrDev: true },
        }),
        tx.notaSaidaItem.groupBy({
          by: ['clienteId'],
          where: { ...itensWhere, clienteId: { not: null } },
        }),
        tx.cliente.count({
          where: { empresaId, deletedAt: null, ativo: true, ...filtroVendedor },
        }),
      ]);

      const produtoIds = gruposPorProduto
        .map((g) => g.produtoId)
        .filter((id): id is string => id !== null);
      const produtos = produtoIds.length
        ? await tx.produto.findMany({
            where: { id: { in: produtoIds } },
            select: { id: true, categoriaId: true },
          })
        : [];
      const categoriaPorProduto = new Map(produtos.map((p) => [p.id, p.categoriaId]));

      let realizadoValor = 0;
      let devolucaoTotal = 0;
      const realizadoPorCategoria = new Map<string, number>();
      for (const g of gruposPorProduto) {
        const total = g._sum.vlrTotal ?? 0;
        const dev = g._sum.vlrDev ?? 0;
        const liquido = total - dev;
        realizadoValor += liquido;
        devolucaoTotal += dev;
        const categoriaId = g.produtoId ? categoriaPorProduto.get(g.produtoId) : null;
        if (categoriaId) {
          realizadoPorCategoria.set(categoriaId, (realizadoPorCategoria.get(categoriaId) ?? 0) + liquido);
        }
      }

      const categoriaIds = new Set([...objetivoPorCategoria.keys(), ...realizadoPorCategoria.keys()]);
      const categoriasInfo = categoriaIds.size
        ? await tx.categoria.findMany({
            where: { id: { in: [...categoriaIds] } },
            select: { id: true, codigoErp: true, descricao: true },
          })
        : [];
      const categorias = categoriasInfo
        .map((c) => ({
          categoriaId: c.id,
          codigoErp: c.codigoErp,
          descricao: c.descricao,
          realizado: realizadoPorCategoria.get(c.id) ?? 0,
          objetivo: objetivoPorCategoria.get(c.id) ?? 0,
        }))
        .sort((a, b) => a.codigoErp.localeCompare(b.codigoErp));

      const clientesPositivados = clientesPositivadosGrupos.length;
      const perc = (num: number, den: number) => (den > 0 ? Math.round((num * 10000) / den) / 100 : 0);

      return {
        objetivoValor,
        realizadoValor,
        percRealizado: perc(realizadoValor, objetivoValor),
        objetivoClientes,
        clientesPositivados,
        percClientes: perc(clientesPositivados, objetivoClientes),
        baseTotal,
        percBase: perc(clientesPositivados, baseTotal),
        devolucaoTotal,
        categorias,
      };
    });
  }
}
