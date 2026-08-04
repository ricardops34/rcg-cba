import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '../../common/prisma/prisma.service';
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
  ClienteCreate,
  ClienteQuery,
  ClienteUpdate,
  PosicaoClienteListQuery,
  PosicaoClienteListRow,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

// Colunas calculadas ao vivo (agregação de notas_saida) que a listagem de
// Posição de Cliente aceita ordenar — mapeia sortBy -> expressão/alias SQL já
// presente no SELECT. Whitelist: nunca interpolar sortBy do usuário direto
// na query (ver uso com Prisma.raw abaixo).
const LISTAGEM_POSICAO_SORT_EXPR: Record<string, string> = {
  razaoSocial: 'c."razaoSocial"',
  codigoErp: 'c."codigoErp"',
  municipio: 'c."municipio"',
  ativo: 'c."ativo"',
  ultimaCompra: 'c."ultimaCompra"',
  vendaUltimos30Dias: '"vendaUltimos30Dias"',
  vendaMedia90Dias: '"vendaMedia90Dias"',
  difMesEMedia: '"difMesEMedia"',
  comodato: '"comodato"',
  bloqueado: '"bloqueado"',
};

interface ListagemPosicaoRawRow {
  id: string;
  codigoErp: string | null;
  razaoSocial: string;
  municipio: string | null;
  uf: string | null;
  ativo: boolean;
  ultimaCompra: Date | null;
  vendaUltimos30Dias: number;
  vendaMedia90Dias: number;
  difMesEMedia: number;
  comodato: boolean;
  bloqueado: boolean;
}

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

// Dados da tabela de preço vinculada ao cliente (Posição de Cliente usa isso
// pra calcular a coluna "Preço de tabela" do mix).
const TABELA_PRECO_SELECT = { select: { id: true, codigoErp: true, descricao: true } };

// A resolução de escopo hierárquico mora em common/escopo/escopo-vendedores
// — compartilhada com Notas de Saída, Itens e Títulos a Receber.

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
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const where = {
        empresaId,
        deletedAt: null,
        ...combinarFiltroVendedor(escopo, query.vendedorId),
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
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
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
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
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
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
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
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
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
   * Posição de Cliente: tela agrupada (cliente + notas de saída + títulos a
   * receber + mix de produtos comprados), cada bloco ligado ao registro
   * detalhado correspondente (nota, produto). Read-only — os dados entram
   * pelo import do ERP.
   */
  async posicao(empresaId: string, user: AuthenticatedUser, clienteId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const filtroEscopo = escopo ? { vendedorId: { in: escopo } } : {};

      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId, empresaId, deletedAt: null, ...filtroEscopo },
        include: {
          vendedor: VENDEDOR_SELECT,
          tabelaPreco: TABELA_PRECO_SELECT,
        },
      });
      if (!cliente) throw new NotFoundException('Cliente não encontrado');

      const [notas, titulos, mixGrupos] = await Promise.all([
        tx.notaSaida.findMany({
          where: { clienteId, empresaId, deletedAt: null, ...filtroEscopo },
          include: { vendedor: VENDEDOR_SELECT },
          orderBy: { dtEmissao: 'desc' },
        }),
        tx.tituloReceber.findMany({
          where: { clienteId, empresaId, deletedAt: null, ...filtroEscopo },
          orderBy: { vencimento: 'desc' },
        }),
        tx.notaSaidaItem.groupBy({
          by: ['produtoId'],
          where: {
            clienteId,
            empresaId,
            deletedAt: null,
            produtoId: { not: null },
            ...filtroEscopo,
          },
          _sum: { quantidade: true, vlrTotal: true },
          _count: { _all: true },
          _max: { dtEmissao: true },
        }),
      ]);

      const produtoIds = mixGrupos
        .map((g) => g.produtoId)
        .filter((id): id is string => id !== null);
      const tabelaPrecoId = cliente.tabelaPrecoId;
      const [produtos, itensTabelaPreco] = await Promise.all([
        tx.produto.findMany({
          where: { id: { in: produtoIds } },
          select: { id: true, codigoErp: true, descricao: true, unidade: true },
        }),
        tabelaPrecoId
          ? tx.tabelaPrecoItem.findMany({
              where: {
                tabelaPrecoId,
                produtoId: { in: produtoIds },
                deletedAt: null,
              },
              select: { produtoId: true, preco: true },
            })
          : Promise.resolve([] as { produtoId: string; preco: number }[]),
      ]);
      const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
      const precoPorProduto = new Map(
        itensTabelaPreco.map((i) => [i.produtoId, i.preco]),
      );

      const mix = mixGrupos
        .map((g) => {
          const produto = g.produtoId
            ? produtoPorId.get(g.produtoId)
            : undefined;
          return {
            produtoId: g.produtoId as string,
            codigoErp: produto?.codigoErp ?? '—',
            descricao: produto?.descricao ?? '—',
            unidade: produto?.unidade ?? null,
            quantidadeTotal: g._sum.quantidade ?? 0,
            vlrTotal: g._sum.vlrTotal ?? 0,
            qtdNotas: g._count._all,
            ultimaCompra: g._max.dtEmissao,
            precoTabela: g.produtoId
              ? (precoPorProduto.get(g.produtoId) ?? null)
              : null,
          };
        })
        .sort((a, b) => b.vlrTotal - a.vlrTotal);

      const hoje = new Date();
      const titulosAbertos = titulos.filter((t) => !t.dtBaixa);
      const resumo = {
        totalNotas: notas.length,
        totalComprado: notas.reduce((acc, n) => acc + n.vlrBruto, 0),
        totalTitulosAberto: titulosAbertos.reduce((acc, t) => acc + t.saldo, 0),
        totalTitulosVencido: titulosAbertos
          .filter((t) => t.vencimento && new Date(t.vencimento) < hoje)
          .reduce((acc, t) => acc + t.saldo, 0),
      };

      return { cliente, resumo, notas, titulos, mix };
    });
  }

  /**
   * Listagem de Posição de Cliente: mesma carteira de Clientes, mas com
   * colunas de venda calculadas ao vivo por agregação de notas_saida (venda
   * dos últimos 30 dias, média mensal dos últimos 90 dias, diferença entre
   * as duas, comodato em aberto, bloqueio). Paginação/ordenação acontecem no
   * banco via SQL bruto — não dá pra ordenar por coluna agregada com o
   * query builder do Prisma, e ORDER BY teria que rodar antes do LIMIT.
   */
  async listagemPosicao(
    empresaId: string,
    user: AuthenticatedUser,
    query: PosicaoClienteListQuery,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);

      const condicoes: Prisma.Sql[] = [
        Prisma.sql`c."empresaId" = ${empresaId}`,
        Prisma.sql`c."deletedAt" IS NULL`,
      ];

      if (escopo !== null) {
        condicoes.push(
          escopo.length > 0
            ? Prisma.sql`c."vendedorId" IN (${Prisma.join(escopo)})`
            : Prisma.sql`false`,
        );
      }
      if (query.vendedorId) {
        condicoes.push(
          escopo !== null && !escopo.includes(query.vendedorId)
            ? Prisma.sql`false`
            : Prisma.sql`c."vendedorId" = ${query.vendedorId}`,
        );
      }
      if (query.ativo !== undefined) condicoes.push(Prisma.sql`c."ativo" = ${query.ativo}`);
      if (query.uf) condicoes.push(Prisma.sql`c."uf" = ${query.uf}`);
      if (query.municipio) condicoes.push(Prisma.sql`c."municipio" = ${query.municipio}`);
      if (query.carteira !== undefined)
        condicoes.push(Prisma.sql`c."carteira" = ${query.carteira}`);
      if (query.search) {
        const termo = `%${query.search}%`;
        condicoes.push(
          Prisma.sql`(c."razaoSocial" ILIKE ${termo} OR c."nomeFantasia" ILIKE ${termo} OR c."codigoErp" ILIKE ${termo} OR c."cnpjCpf" ILIKE ${termo})`,
        );
      }
      if (query.diasSemComprar !== undefined) {
        condicoes.push(
          Prisma.sql`(c."ultimaCompra" IS NULL OR c."ultimaCompra" <= now() - (${query.diasSemComprar} * interval '1 day'))`,
        );
      }
      if (query.bloqueado !== undefined) {
        const bloqueadoExpr = Prisma.sql`(c."dataBloqueio" IS NOT NULL AND (c."dataReativacao" IS NULL OR c."dataReativacao" < c."dataBloqueio"))`;
        condicoes.push(query.bloqueado ? bloqueadoExpr : Prisma.sql`NOT ${bloqueadoExpr}`);
      }

      const where = Prisma.join(condicoes, ' AND ');

      const sortField =
        query.sortBy && LISTAGEM_POSICAO_SORT_EXPR[query.sortBy] ? query.sortBy : 'ultimaCompra';
      const sortDir = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
      // "dias" (dias sem comprar) é o inverso de ultimaCompra: menos dias =
      // compra mais recente = ultimaCompra maior. NULLS explícito porque o
      // cliente sem nenhuma compra deve valer "infinitos dias".
      const orderBy =
        query.sortBy === 'dias'
          ? sortDir === 'ASC'
            ? Prisma.raw('c."ultimaCompra" DESC NULLS LAST')
            : Prisma.raw('c."ultimaCompra" ASC NULLS FIRST')
          : Prisma.raw(`${LISTAGEM_POSICAO_SORT_EXPR[sortField]} ${sortDir}`);

      const { skip, take } = paginationToSkipTake(query);

      const select = Prisma.sql`
        SELECT
          c.id,
          c."codigoErp",
          c."razaoSocial",
          c."municipio",
          c."uf",
          c."ativo",
          c."ultimaCompra",
          COALESCE(v30.total, 0) AS "vendaUltimos30Dias",
          COALESCE(v90.total, 0) / 3.0 AS "vendaMedia90Dias",
          COALESCE(v30.total, 0) - (COALESCE(v90.total, 0) / 3.0) AS "difMesEMedia",
          EXISTS (
            SELECT 1 FROM notas_saida cm
            WHERE cm."clienteId" = c.id AND cm."empresaId" = c."empresaId"
              AND cm."comodato" = true AND cm."deletedAt" IS NULL
          ) AS "comodato",
          (c."dataBloqueio" IS NOT NULL AND (c."dataReativacao" IS NULL OR c."dataReativacao" < c."dataBloqueio")) AS "bloqueado"
        FROM clientes c
        LEFT JOIN (
          SELECT "clienteId", SUM("vlrBruto") AS total
          FROM notas_saida
          WHERE "empresaId" = ${empresaId} AND "deletedAt" IS NULL
            AND "dtEmissao" >= now() - interval '30 days'
          GROUP BY "clienteId"
        ) v30 ON v30."clienteId" = c.id
        LEFT JOIN (
          SELECT "clienteId", SUM("vlrBruto") AS total
          FROM notas_saida
          WHERE "empresaId" = ${empresaId} AND "deletedAt" IS NULL
            AND "dtEmissao" >= now() - interval '90 days'
          GROUP BY "clienteId"
        ) v90 ON v90."clienteId" = c.id
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${take} OFFSET ${skip}
      `;
      const countSelect = Prisma.sql`SELECT COUNT(*)::int AS count FROM clientes c WHERE ${where}`;

      const [rows, countRows] = await Promise.all([
        tx.$queryRaw<ListagemPosicaoRawRow[]>(select),
        tx.$queryRaw<{ count: number }[]>(countSelect),
      ]);

      const agora = new Date().getTime();
      const data: PosicaoClienteListRow[] = rows.map((r) => ({
        id: r.id,
        codigoErp: r.codigoErp,
        razaoSocial: r.razaoSocial,
        municipio: r.municipio,
        uf: r.uf,
        ativo: r.ativo,
        ultimaCompra: r.ultimaCompra ? r.ultimaCompra.toISOString() : null,
        dias: r.ultimaCompra ? Math.floor((agora - r.ultimaCompra.getTime()) / 86_400_000) : null,
        vendaUltimos30Dias: Number(r.vendaUltimos30Dias),
        vendaMedia90Dias: Number(r.vendaMedia90Dias),
        difMesEMedia: Number(r.difMesEMedia),
        comodato: r.comodato,
        bloqueado: r.bloqueado,
      }));

      return buildPaginatedResult(data, countRows[0]?.count ?? 0, query);
    });
  }

  /**
   * Vendedores dentro do escopo do usuário logado — alimenta o filtro
   * "Vendedor" da listagem e o Select do formulário sem expor o
   * VendedoresController (que não tem restrição de carteira).
   *
   * ehVendedorPuro: true só quando o próprio usuário é um vendedor "de
   * carteira" (nem supervisor nem gerente) — a tela usa isso pra esconder o
   * filtro Vendedor por completo (filtrar pela própria carteira não faz
   * sentido). Supervisor/gerente continuam vendo o filtro, já restrito ao
   * próprio time pelo escopo acima.
   */
  vendedoresEscopo(empresaId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const [escopo, vendedorProprio] = await Promise.all([
        resolverEscopoVendedores(tx, empresaId, user),
        tx.vendedor.findFirst({
          where: { usuarioId: user.id, empresaId, deletedAt: null },
          select: { supervisor: true, gerente: true },
        }),
      ]);
      const data = await tx.vendedor.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ativo: true,
          ...(escopo ? { id: { in: escopo } } : {}),
        },
        orderBy: { nome: 'asc' },
      });
      const ehVendedorPuro =
        escopo !== null && !vendedorProprio?.supervisor && !vendedorProprio?.gerente;
      return { data, restrito: escopo !== null, ehVendedorPuro };
    });
  }

  /**
   * Municípios distintos presentes na carteira visível ao usuário logado —
   * alimenta o filtro "Município" da listagem de Posição de Cliente. Mesmo
   * racional de vendedoresEscopo: nunca expõe municípios de clientes fora do
   * escopo hierárquico do usuário.
   */
  municipiosEscopo(empresaId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const rows = await tx.cliente.findMany({
        where: {
          empresaId,
          deletedAt: null,
          municipio: { not: null },
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
        select: { municipio: true },
        distinct: ['municipio'],
        orderBy: { municipio: 'asc' },
      });
      return { data: rows.map((r) => r.municipio as string) };
    });
  }

  /**
   * UFs distintas presentes na carteira visível ao usuário logado — alimenta
   * o filtro "UF" (Clientes e Posição de Cliente). Mesmo racional de
   * municipiosEscopo: só lista o que realmente existe no cadastro, e nunca
   * expõe UFs de clientes fora do escopo hierárquico do usuário.
   */
  ufsEscopo(empresaId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const rows = await tx.cliente.findMany({
        where: {
          empresaId,
          deletedAt: null,
          uf: { not: null },
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
        select: { uf: true },
        distinct: ['uf'],
        orderBy: { uf: 'asc' },
      });
      return { data: rows.map((r) => r.uf as string) };
    });
  }
}
