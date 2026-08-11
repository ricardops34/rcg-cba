import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import type {
  BaseVendedor,
  ConsultaVendasClienteQuery,
  ConsultaVendasColuna,
  ConsultaVendasLinha,
  ConsultaVendasProdutoQuery,
  ConsultaVendasResultado,
  ConsultaVendasVendedorQuery,
} from '@plataforma/contracts';
import {
  PARAMETRO_BASE_VENDEDOR,
  colunasDoPeriodo,
  emMeses,
  rotuloMes,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ParametrosService } from '../parametros/parametros.service';

/** Linha crua do banco: uma por (entidade, ano, mês). O pivô é feito aqui. */
interface LinhaAgregada {
  id: string;
  codigo: string | null;
  descricao: string;
  ano: number;
  mes: number;
  valor: number;
}

interface Periodo {
  anoInicial: number;
  mesInicial: number;
  anoFinal: number;
  mesFinal: number;
}

/**
 * Consultas gerenciais de venda. Duas características valem o SQL bruto: a
 * agregação por mês (o query builder não pivota) e o fato de o campo do
 * vendedor variar conforme o parâmetro da empresa.
 *
 * Base: nota ATIVA e não-comodato, a mesma regra da Posição de Cliente —
 * comodato é remessa, e nota inativa é cancelamento no ERP.
 */
@Injectable()
export class ConsultasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
  ) {}

  /**
   * `nota` (padrão) credita a venda a quem a fez; `cliente`, ao titular da
   * carteira.
   *
   * O parâmetro da empresa (Administração > Parâmetros) define o padrão da
   * casa; a consulta pode sobrescrevê-lo pontualmente pela cortina de
   * parâmetros, sem mudar a configuração para todo mundo.
   */
  private async baseVendedor(
    empresaId: string,
    tx: TenantTx,
    escolhaDaConsulta?: BaseVendedor,
  ): Promise<BaseVendedor> {
    if (escolhaDaConsulta) return escolhaDaConsulta;
    const valor = await this.parametros.obterTexto(
      empresaId,
      PARAMETRO_BASE_VENDEDOR,
      'nota',
      tx,
    );
    return valor === 'cliente' ? 'cliente' : 'nota';
  }

  /**
   * Restrição de acesso: o usuário só enxerga o que vendeu para os clientes
   * da carteira que alcança — sempre por `clientes.vendedorId`, mesmo quando
   * a apuração credita o vendedor da nota. Quem pode ver é uma pergunta de
   * permissão (carteira de clientes), não de critério de comissionamento.
   */
  private condicaoEscopoClientes(escopo: string[] | null): Prisma.Sql[] {
    if (escopo === null) return [];
    return [
      escopo.length > 0
        ? Prisma.sql`c."vendedorId" IN (${Prisma.join(escopo)})`
        : Prisma.sql`false`,
    ];
  }

  /**
   * Filtro de vendedor escolhido na tela, sobre a coluna que a base define.
   * Um vendedorId fora do escopo zera o resultado em vez de vazar carteira de
   * fora do time (mesma regra de combinarFiltroVendedor).
   */
  private condicaoFiltroVendedor(
    coluna: Prisma.Sql,
    escopo: string[] | null,
    vendedorId?: string,
  ): Prisma.Sql[] {
    if (!vendedorId) return [];
    const permitido = escopo === null || escopo.includes(vendedorId);
    return [
      permitido ? Prisma.sql`${coluna} = ${vendedorId}` : Prisma.sql`false`,
    ];
  }

  /**
   * O que conta como venda, em todas as consultas:
   *
   * - `ativo` — nota cancelada no ERP fica de fora;
   * - `comodato = false` — remessa de comodato não é venda;
   * - `tipo = 'N'` (Normal) — exclui devolução e as remessas/retornos, que no
   *   ERP vêm como tipo 'D' (CFOP 5915/5916/6202/6909…), além de 'B'
   *   (beneficiamento), 'C' (complemento) e 'I'.
   *
   * `n` é sempre o alias do cabeçalho da nota, mesmo quando a consulta
   * agrega itens: é o cabeçalho que diz o que o documento é.
   */
  private readonly condicoesNotaDeVenda: Prisma.Sql[] = [
    Prisma.sql`n."deletedAt" IS NULL`,
    Prisma.sql`n."ativo" = true`,
    Prisma.sql`n."comodato" = false`,
    Prisma.sql`n."tipo" = 'N'`,
  ];

  /** Recorte do período em meses corridos, sobre as colunas ano/mes do ERP. */
  private condicaoPeriodo(prefixo: Prisma.Sql, periodo: Periodo): Prisma.Sql[] {
    return [
      Prisma.sql`(${prefixo}."ano" * 12 + ${prefixo}."mes") BETWEEN ${emMeses(
        periodo.anoInicial,
        periodo.mesInicial,
      )} AND ${emMeses(periodo.anoFinal, periodo.mesFinal)}`,
    ];
  }

  /** Pivota as linhas (entidade, ano, mês) numa linha por entidade. */
  private pivotar(
    agregadas: LinhaAgregada[],
    colunas: ConsultaVendasColuna[],
  ): {
    linhas: ConsultaVendasLinha[];
    totais: number[];
    total: number;
  } {
    const indicePorMes = new Map(
      colunas.map((c, i) => [emMeses(c.ano, c.mes), i]),
    );
    const porEntidade = new Map<string, ConsultaVendasLinha>();
    const totais = Array<number>(colunas.length).fill(0);

    for (const linha of agregadas) {
      const indice = indicePorMes.get(emMeses(linha.ano, linha.mes));
      if (indice === undefined) continue;

      let atual = porEntidade.get(linha.id);
      if (!atual) {
        atual = {
          id: linha.id,
          codigo: linha.codigo,
          descricao: linha.descricao,
          valores: Array<number>(colunas.length).fill(0),
          total: 0,
        };
        porEntidade.set(linha.id, atual);
      }
      const valor = Number(linha.valor);
      atual.valores[indice] += valor;
      atual.total += valor;
      totais[indice] += valor;
    }

    const linhas = [...porEntidade.values()].sort((a, b) => b.total - a.total);
    return { linhas, totais, total: totais.reduce((acc, v) => acc + v, 0) };
  }

  private async vendedorRef(tx: TenantTx, empresaId: string, id?: string) {
    if (!id) return null;
    const v = await tx.vendedor.findFirst({
      where: { id, empresaId, deletedAt: null },
      select: { id: true, nome: true, nomeReduzido: true },
    });
    return v ? { id: v.id, nome: v.nomeReduzido || v.nome } : null;
  }

  /** Cabeçalho comum das três consultas. */
  private cabecalho(periodo: Periodo, base: BaseVendedor) {
    return {
      periodo: {
        ...periodo,
        label: `${rotuloMes(periodo.anoInicial, periodo.mesInicial)} a ${rotuloMes(
          periodo.anoFinal,
          periodo.mesFinal,
        )}`,
      },
      colunas: colunasDoPeriodo(periodo),
      baseVendedor: base,
    };
  }

  /**
   * Vendas do período por cliente, mês a mês. Valor = vlrBruto da nota (mesmo
   * número do "Total comprado" da Posição de Cliente).
   */
  async vendasPorCliente(
    empresaId: string,
    user: AuthenticatedUser,
    query: ConsultaVendasClienteQuery,
  ): Promise<ConsultaVendasResultado> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const base = await this.baseVendedor(empresaId, tx, query.baseVendedor);
      const colunaVendedor =
        base === 'cliente'
          ? Prisma.sql`c."vendedorId"`
          : Prisma.sql`n."vendedorId"`;

      const condicoes: Prisma.Sql[] = [
        Prisma.sql`n."empresaId" = ${empresaId}`,
        ...this.condicoesNotaDeVenda,
        ...this.condicaoPeriodo(Prisma.sql`n`, query),
        ...this.condicaoEscopoClientes(escopo),
        ...this.condicaoFiltroVendedor(
          colunaVendedor,
          escopo,
          query.vendedorId,
        ),
      ];

      const agregadas = await tx.$queryRaw<LinhaAgregada[]>(Prisma.sql`
        SELECT
          c."id"          AS "id",
          c."codigoErp"   AS "codigo",
          c."razaoSocial" AS "descricao",
          n."ano"         AS "ano",
          n."mes"         AS "mes",
          SUM(n."vlrBruto")::float8 AS "valor"
        FROM "notas_saida" n
        JOIN "clientes" c ON c."id" = n."clienteId" AND c."deletedAt" IS NULL
        WHERE ${Prisma.join(condicoes, ' AND ')}
        GROUP BY c."id", c."codigoErp", c."razaoSocial", n."ano", n."mes"
      `);

      const cabecalho = this.cabecalho(query, base);
      return {
        ...cabecalho,
        vendedor: await this.vendedorRef(tx, empresaId, query.vendedorId),
        categoria: null,
        ...this.pivotar(agregadas, cabecalho.colunas),
      };
    });
  }

  /**
   * Vendas do período por vendedor, mês a mês. Mesma base da consulta por
   * cliente (vlrBruto da nota) — aqui o vendedor deixa de ser filtro e passa
   * a ser a linha, mas continua sendo o campo que o parâmetro da empresa
   * define: com base `cliente`, a venda é creditada ao titular da carteira,
   * e não a quem emitiu a nota.
   */
  async vendasPorVendedor(
    empresaId: string,
    user: AuthenticatedUser,
    query: ConsultaVendasVendedorQuery,
  ): Promise<ConsultaVendasResultado> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const base = await this.baseVendedor(empresaId, tx, query.baseVendedor);
      const colunaVendedor =
        base === 'cliente'
          ? Prisma.sql`c."vendedorId"`
          : Prisma.sql`n."vendedorId"`;

      const condicoes: Prisma.Sql[] = [
        Prisma.sql`n."empresaId" = ${empresaId}`,
        ...this.condicoesNotaDeVenda,
        ...this.condicaoPeriodo(Prisma.sql`n`, query),
        ...this.condicaoEscopoClientes(escopo),
        ...this.condicaoFiltroVendedor(
          colunaVendedor,
          escopo,
          query.vendedorId,
        ),
      ];

      const agregadas = await tx.$queryRaw<LinhaAgregada[]>(Prisma.sql`
        SELECT
          v."id"        AS "id",
          v."codigoErp" AS "codigo",
          COALESCE(v."nomeReduzido", v."nome") AS "descricao",
          n."ano"       AS "ano",
          n."mes"       AS "mes",
          SUM(n."vlrBruto")::float8 AS "valor"
        FROM "notas_saida" n
        JOIN "clientes" c ON c."id" = n."clienteId" AND c."deletedAt" IS NULL
        JOIN "vendedores" v ON v."id" = ${colunaVendedor} AND v."deletedAt" IS NULL
        WHERE ${Prisma.join(condicoes, ' AND ')}
        GROUP BY v."id", v."codigoErp", v."nomeReduzido", v."nome", n."ano", n."mes"
      `);

      const cabecalho = this.cabecalho(query, base);
      return {
        ...cabecalho,
        vendedor: await this.vendedorRef(tx, empresaId, query.vendedorId),
        categoria: null,
        ...this.pivotar(agregadas, cabecalho.colunas),
      };
    });
  }

  /**
   * Vendas do período por produto, mês a mês. Valor = vlrTotal do item (frete
   * e impostos do cabeçalho não são rateados por item).
   */
  async vendasPorProduto(
    empresaId: string,
    user: AuthenticatedUser,
    query: ConsultaVendasProdutoQuery,
  ): Promise<ConsultaVendasResultado> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const base = await this.baseVendedor(empresaId, tx, query.baseVendedor);
      const colunaVendedor =
        base === 'cliente'
          ? Prisma.sql`c."vendedorId"`
          : Prisma.sql`i."vendedorId"`;

      const condicoes: Prisma.Sql[] = [
        Prisma.sql`i."empresaId" = ${empresaId}`,
        Prisma.sql`i."deletedAt" IS NULL`,
        Prisma.sql`i."ativo" = true`,
        ...this.condicaoPeriodo(Prisma.sql`i`, query),
        // O cabeçalho manda no que é venda: item de nota cancelada, de
        // devolução ou de remessa de comodato não entra.
        ...this.condicoesNotaDeVenda,
        ...this.condicaoEscopoClientes(escopo),
        ...this.condicaoFiltroVendedor(
          colunaVendedor,
          escopo,
          query.vendedorId,
        ),
      ];
      if (query.categoriaId) {
        condicoes.push(Prisma.sql`p."categoriaId" = ${query.categoriaId}`);
      }

      const agregadas = await tx.$queryRaw<LinhaAgregada[]>(Prisma.sql`
        SELECT
          p."id"        AS "id",
          p."codigoErp" AS "codigo",
          p."descricao" AS "descricao",
          i."ano"       AS "ano",
          i."mes"       AS "mes",
          SUM(i."vlrTotal")::float8 AS "valor"
        FROM "notas_saida_itens" i
        JOIN "notas_saida" n ON n."id" = i."notaSaidaId"
        JOIN "clientes" c ON c."id" = n."clienteId" AND c."deletedAt" IS NULL
        JOIN "produtos" p ON p."id" = i."produtoId" AND p."deletedAt" IS NULL
        WHERE ${Prisma.join(condicoes, ' AND ')}
        GROUP BY p."id", p."codigoErp", p."descricao", i."ano", i."mes"
      `);

      const categoria = query.categoriaId
        ? await tx.categoria.findFirst({
            where: { id: query.categoriaId, empresaId, deletedAt: null },
            select: { id: true, descricao: true },
          })
        : null;

      const cabecalho = this.cabecalho(query, base);
      return {
        ...cabecalho,
        vendedor: await this.vendedorRef(tx, empresaId, query.vendedorId),
        categoria,
        ...this.pivotar(agregadas, cabecalho.colunas),
      };
    });
  }
}
