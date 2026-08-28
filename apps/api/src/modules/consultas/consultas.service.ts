import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import {
  CONDICOES_ITEM_DE_VENDA_SQL,
  CONDICOES_NOTA_DE_VENDA_SQL,
  JOIN_CATEGORIA_DO_ITEM_SQL,
} from '../../common/vendas/venda-analitica';
import type {
  BaseVendedor,
  ConsultaEvolucaoQuery,
  ConsultaEvolucaoResultado,
  ConsultaVendasClienteQuery,
  ConsultaVendasColuna,
  ConsultaVendasLinha,
  ConsultaVendasProdutoQuery,
  ConsultaVendasResultado,
  ConsultaVendasVendedorQuery,
  FormatoEvolucao,
} from '@plataforma/contracts';
import {
  INDICADORES_EVOLUCAO,
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
 * Base: o que `common/vendas/venda-analitica` define como venda — nota ativa,
 * fora de comodato, do tipo Normal e com financeiro —, somada pelos itens de
 * categoria acompanhada. A mesma base do Dashboard e dos Objetivos.
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
   * Filtro de vendedor(es) escolhido na tela, sobre a coluna que a base
   * define. Ids fora do escopo são descartados em vez de consultados — e se
   * NENHUM dos pedidos for permitido, o resultado é vazio, não "todos": cair
   * no sem-filtro aqui mostraria a carteira inteira a quem pediu justamente a
   * de outra pessoa (mesma regra de combinarFiltroVendedor).
   */
  private condicaoFiltroVendedor(
    coluna: Prisma.Sql,
    escopo: string[] | null,
    vendedorIds?: string[],
  ): Prisma.Sql[] {
    if (!vendedorIds || vendedorIds.length === 0) return [];
    const permitidos =
      escopo === null ? vendedorIds : vendedorIds.filter((id) => escopo.includes(id));
    if (permitidos.length === 0) return [Prisma.sql`false`];
    return [Prisma.sql`${coluna} IN (${Prisma.join(permitidos)})`];
  }

  /**
   * O que conta como venda, aqui e no Dashboard/Objetivos — a definição mora
   * em `common/vendas/venda-analitica`, para as três telas responderem a
   * mesma coisa.
   */
  private readonly condicoesNotaDeVenda = CONDICOES_NOTA_DE_VENDA_SQL;

  /** Recorte do período em meses corridos, sobre as colunas ano/mes do ERP. */
  private condicaoPeriodo(prefixo: Prisma.Sql, periodo: Periodo): Prisma.Sql[] {
    return [
      Prisma.sql`(${prefixo}."ano" * 12 + ${prefixo}."mes") BETWEEN ${emMeses(
        periodo.anoInicial,
        periodo.mesInicial,
      )} AND ${emMeses(periodo.anoFinal, periodo.mesFinal)}`,
    ];
  }

  /**
   * Média por mês COM movimento: o divisor é quantos meses tiveram valor, não
   * o tamanho do período. Cliente que comprou em 2 dos 12 meses tem a média do
   * que ele compra quando compra — dividir por 12 diluiria o número até virar
   * outra coisa. Mês que zerou por compensação (venda e devolução iguais) não
   * conta, porque `valores` guarda o líquido e ele ficou 0.
   */
  private mediaMesesComMovimento(valores: number[], total: number): number {
    const meses = valores.filter((v) => v !== 0).length;
    return meses > 0 ? Math.round((total / meses) * 100) / 100 : 0;
  }

  /** Pivota as linhas (entidade, ano, mês) numa linha por entidade. */
  private pivotar(
    agregadas: LinhaAgregada[],
    colunas: ConsultaVendasColuna[],
  ): {
    linhas: ConsultaVendasLinha[];
    totais: number[];
    total: number;
    media: number;
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
          media: 0, // preenchido no fim, com os valores todos somados
        };
        porEntidade.set(linha.id, atual);
      }
      const valor = Number(linha.valor);
      atual.valores[indice] += valor;
      atual.total += valor;
      totais[indice] += valor;
    }

    const linhas = [...porEntidade.values()].sort((a, b) => b.total - a.total);
    for (const linha of linhas) {
      linha.media = this.mediaMesesComMovimento(linha.valores, linha.total);
    }
    const total = totais.reduce((acc, v) => acc + v, 0);
    return {
      linhas,
      totais,
      total,
      media: this.mediaMesesComMovimento(totais, total),
    };
  }

  /**
   * Nomes dos vendedores filtrados, para a tela e o cabeçalho do PDF dizerem
   * de quem é o número. Ordena por nome, não pela ordem em que vieram na
   * query — o cabeçalho é para ler, não para refletir cliques.
   */
  private async vendedoresRef(
    tx: TenantTx,
    empresaId: string,
    ids?: string[],
  ): Promise<{ id: string; nome: string }[]> {
    if (!ids || ids.length === 0) return [];
    const encontrados = await tx.vendedor.findMany({
      where: { id: { in: ids }, empresaId, deletedAt: null },
      select: { id: true, nome: true, nomeReduzido: true },
    });
    return encontrados
      .map((v) => ({ id: v.id, nome: v.nomeReduzido || v.nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
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
   * Vendas do período por cliente, mês a mês. Valor = soma do `vlrTotal` dos
   * itens que entram na análise.
   *
   * Era o `vlrBruto` do cabeçalho, que é mais simples e batia com o "Total
   * comprado" da Posição de Cliente — mas no cabeçalho não há como descartar
   * o item de categoria que a empresa não acompanha: ou entra a nota inteira,
   * ou nenhuma. Somando item a item, o recorte de categoria vale aqui como
   * vale no Dashboard, ao preço de o total deixar de incluir o que só existe
   * no cabeçalho (IPI/ST e frete). A Posição de Cliente segue no vlrBruto:
   * lá o assunto é o documento, não a análise.
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
        ...CONDICOES_ITEM_DE_VENDA_SQL,
        ...this.condicaoPeriodo(Prisma.sql`n`, query),
        ...this.condicaoEscopoClientes(escopo),
        ...this.condicaoFiltroVendedor(
          colunaVendedor,
          escopo,
          query.vendedorIds,
        ),
      ];

      const agregadas = await tx.$queryRaw<LinhaAgregada[]>(Prisma.sql`
        SELECT
          c."id"          AS "id",
          c."codigoErp"   AS "codigo",
          c."razaoSocial" AS "descricao",
          n."ano"         AS "ano",
          n."mes"         AS "mes",
          SUM(i."vlrTotal")::float8 AS "valor"
        FROM "notas_saida" n
        JOIN "clientes" c ON c."id" = n."clienteId" AND c."deletedAt" IS NULL
        JOIN "notas_saida_itens" i ON i."notaSaidaId" = n."id"
        ${JOIN_CATEGORIA_DO_ITEM_SQL}
        WHERE ${Prisma.join(condicoes, ' AND ')}
        GROUP BY c."id", c."codigoErp", c."razaoSocial", n."ano", n."mes"
      `);

      const cabecalho = this.cabecalho(query, base);
      return {
        ...cabecalho,
        vendedores: await this.vendedoresRef(tx, empresaId, query.vendedorIds),
        categoria: null,
        ...this.pivotar(agregadas, cabecalho.colunas),
      };
    });
  }

  /**
   * Vendas do período por vendedor, mês a mês. Mesma base da consulta por
   * cliente (soma dos itens) — aqui o vendedor deixa de ser filtro e passa
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
        ...CONDICOES_ITEM_DE_VENDA_SQL,
        ...this.condicaoPeriodo(Prisma.sql`n`, query),
        ...this.condicaoEscopoClientes(escopo),
        ...this.condicaoFiltroVendedor(
          colunaVendedor,
          escopo,
          query.vendedorIds,
        ),
      ];

      const agregadas = await tx.$queryRaw<LinhaAgregada[]>(Prisma.sql`
        SELECT
          v."id"        AS "id",
          v."codigoErp" AS "codigo",
          COALESCE(v."nomeReduzido", v."nome") AS "descricao",
          n."ano"       AS "ano",
          n."mes"       AS "mes",
          SUM(i."vlrTotal")::float8 AS "valor"
        FROM "notas_saida" n
        JOIN "clientes" c ON c."id" = n."clienteId" AND c."deletedAt" IS NULL
        JOIN "vendedores" v ON v."id" = ${colunaVendedor} AND v."deletedAt" IS NULL
        JOIN "notas_saida_itens" i ON i."notaSaidaId" = n."id"
        ${JOIN_CATEGORIA_DO_ITEM_SQL}
        WHERE ${Prisma.join(condicoes, ' AND ')}
        GROUP BY v."id", v."codigoErp", v."nomeReduzido", v."nome", n."ano", n."mes"
      `);

      const cabecalho = this.cabecalho(query, base);
      return {
        ...cabecalho,
        vendedores: await this.vendedoresRef(tx, empresaId, query.vendedorIds),
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
        // Aqui a categoria vem do produto que a consulta já traz (alias `p`),
        // então não é preciso o join extra de `JOIN_CATEGORIA_DO_ITEM_SQL`.
        ...CONDICOES_ITEM_DE_VENDA_SQL,
        ...this.condicaoPeriodo(Prisma.sql`i`, query),
        // O cabeçalho manda no que é venda: item de nota cancelada, de
        // devolução, de remessa de comodato ou sem financeiro não entra.
        ...this.condicoesNotaDeVenda,
        ...this.condicaoEscopoClientes(escopo),
        ...this.condicaoFiltroVendedor(
          colunaVendedor,
          escopo,
          query.vendedorIds,
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
        LEFT JOIN "categorias" cat ON cat."id" = p."categoriaId"
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
        vendedores: await this.vendedoresRef(tx, empresaId, query.vendedorIds),
        categoria,
        ...this.pivotar(agregadas, cabecalho.colunas),
      };
    });
  }

  /**
   * Evolução mensal por vendedor, no indicador escolhido (ver
   * INDICADORES_EVOLUCAO nos contratos). Sai no mesmo formato pivô das outras
   * consultas — uma linha por vendedor, uma coluna por mês —, que o gráfico da
   * tela lê como uma série por vendedor.
   *
   * Os três indicadores de cliente contam clientes, não dinheiro:
   *
   * - `positivados` — clientes distintos com compra no mês;
   * - `novos` — clientes cuja primeira compra de TODO o histórico caiu no mês
   *   (a apuração da primeira compra ignora o período consultado de
   *   propósito: senão todo cliente que comprou no primeiro mês da consulta
   *   pareceria novo);
   * - `inativados` — clientes com data de bloqueio no mês. Não há nota
   *   envolvida, então o crédito é sempre do vendedor do cadastro e a escolha
   *   de base é ignorada (a resposta devolve `cliente`, que é o que valeu).
   */
  async evolucao(
    empresaId: string,
    user: AuthenticatedUser,
    query: ConsultaEvolucaoQuery,
  ): Promise<ConsultaEvolucaoResultado> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const baseEscolhida = await this.baseVendedor(
        empresaId,
        tx,
        query.baseVendedor,
      );
      const base: BaseVendedor =
        query.indicador === 'inativados' ? 'cliente' : baseEscolhida;

      const agregadas =
        query.indicador === 'inativados'
          ? await this.evolucaoInativados(tx, empresaId, escopo, query)
          : query.indicador === 'novos'
            ? await this.evolucaoNovos(tx, empresaId, escopo, base, query)
            : await this.evolucaoSobreNotas(tx, empresaId, escopo, base, query);

      const formato: FormatoEvolucao =
        INDICADORES_EVOLUCAO.find((i) => i.valor === query.indicador)
          ?.formato ?? 'quantidade';

      const cabecalho = this.cabecalho(query, base);
      return {
        ...cabecalho,
        vendedores: await this.vendedoresRef(tx, empresaId, query.vendedorIds),
        categoria: null,
        indicador: query.indicador,
        formato,
        ...this.pivotar(agregadas, cabecalho.colunas),
      };
    });
  }

  /** Colunas de identificação do vendedor, iguais em todos os indicadores. */
  private readonly selecaoVendedor = Prisma.sql`
    v."id"        AS "id",
    v."codigoErp" AS "codigo",
    COALESCE(v."nomeReduzido", v."nome") AS "descricao"`;
  private readonly agrupamentoVendedor = Prisma.sql`v."id", v."codigoErp", v."nomeReduzido", v."nome"`;

  /**
   * `vendas` (soma dos itens) e `positivados` (clientes distintos no mês).
   *
   * Os dois partem dos itens, e não do cabeçalho: além de o valor precisar
   * disso para respeitar a categoria, positivado é quem comprou **algo que a
   * empresa acompanha** — nota só de item descartado não positiva cliente.
   * O `DISTINCT` já cuida de a nota virar várias linhas no join.
   */
  private evolucaoSobreNotas(
    tx: TenantTx,
    empresaId: string,
    escopo: string[] | null,
    base: BaseVendedor,
    query: ConsultaEvolucaoQuery,
  ) {
    const colunaVendedor =
      base === 'cliente'
        ? Prisma.sql`c."vendedorId"`
        : Prisma.sql`n."vendedorId"`;
    const condicoes: Prisma.Sql[] = [
      Prisma.sql`n."empresaId" = ${empresaId}`,
      ...this.condicoesNotaDeVenda,
      ...CONDICOES_ITEM_DE_VENDA_SQL,
      ...this.condicaoPeriodo(Prisma.sql`n`, query),
      ...this.condicaoEscopoClientes(escopo),
      ...this.condicaoFiltroVendedor(colunaVendedor, escopo, query.vendedorIds),
    ];
    const medida =
      query.indicador === 'positivados'
        ? Prisma.sql`COUNT(DISTINCT n."clienteId")::float8`
        : Prisma.sql`SUM(i."vlrTotal")::float8`;

    return tx.$queryRaw<LinhaAgregada[]>(Prisma.sql`
      SELECT
        ${this.selecaoVendedor},
        n."ano" AS "ano",
        n."mes" AS "mes",
        ${medida} AS "valor"
      FROM "notas_saida" n
      JOIN "clientes" c ON c."id" = n."clienteId" AND c."deletedAt" IS NULL
      JOIN "vendedores" v ON v."id" = ${colunaVendedor} AND v."deletedAt" IS NULL
      JOIN "notas_saida_itens" i ON i."notaSaidaId" = n."id"
      ${JOIN_CATEGORIA_DO_ITEM_SQL}
      WHERE ${Prisma.join(condicoes, ' AND ')}
      GROUP BY ${this.agrupamentoVendedor}, n."ano", n."mes"
    `);
  }

  /**
   * `novos`: a CTE reduz cada cliente à sua primeira nota de venda de todo o
   * histórico (DISTINCT ON pelo cliente, ordenado por ano/mês/emissão), e só
   * depois o período recorta quem estreou dentro dele. Com a base em `nota`, o
   * crédito vai para quem emitiu essa primeira nota.
   *
   * A estreia também é medida pelo item: a primeira nota que valeu é a
   * primeira que trouxe algo que a empresa acompanha — senão o cliente
   * "estreava" numa remessa de brinde e nunca mais aparecia como novo.
   */
  private evolucaoNovos(
    tx: TenantTx,
    empresaId: string,
    escopo: string[] | null,
    base: BaseVendedor,
    query: ConsultaEvolucaoQuery,
  ) {
    const colunaVendedor =
      base === 'cliente'
        ? Prisma.sql`c."vendedorId"`
        : Prisma.sql`p."vendedorId"`;
    const condicoesPrimeira: Prisma.Sql[] = [
      Prisma.sql`n."empresaId" = ${empresaId}`,
      ...this.condicoesNotaDeVenda,
      ...CONDICOES_ITEM_DE_VENDA_SQL,
      Prisma.sql`n."clienteId" IS NOT NULL`,
      Prisma.sql`n."ano" IS NOT NULL`,
      Prisma.sql`n."mes" IS NOT NULL`,
    ];
    const condicoes: Prisma.Sql[] = [
      ...this.condicaoPeriodo(Prisma.sql`p`, query),
      ...this.condicaoEscopoClientes(escopo),
      ...this.condicaoFiltroVendedor(colunaVendedor, escopo, query.vendedorIds),
    ];

    return tx.$queryRaw<LinhaAgregada[]>(Prisma.sql`
      WITH "primeira_compra" AS (
        SELECT DISTINCT ON (n."clienteId")
          n."clienteId"  AS "clienteId",
          n."ano"        AS "ano",
          n."mes"        AS "mes",
          n."vendedorId" AS "vendedorId"
        FROM "notas_saida" n
        JOIN "notas_saida_itens" i ON i."notaSaidaId" = n."id"
        ${JOIN_CATEGORIA_DO_ITEM_SQL}
        WHERE ${Prisma.join(condicoesPrimeira, ' AND ')}
        ORDER BY n."clienteId", n."ano", n."mes", n."dtEmissao"
      )
      SELECT
        ${this.selecaoVendedor},
        p."ano" AS "ano",
        p."mes" AS "mes",
        COUNT(*)::float8 AS "valor"
      FROM "primeira_compra" p
      JOIN "clientes" c ON c."id" = p."clienteId" AND c."deletedAt" IS NULL
      JOIN "vendedores" v ON v."id" = ${colunaVendedor} AND v."deletedAt" IS NULL
      WHERE ${Prisma.join(condicoes, ' AND ')}
      GROUP BY ${this.agrupamentoVendedor}, p."ano", p."mes"
    `);
  }

  /**
   * `inativados`: parte do cadastro do cliente, não de nota — o mês vem da
   * data de bloqueio e o vendedor é o titular da carteira. Conta o bloqueio
   * registrado, mesmo que o cliente tenha sido reativado depois (a data
   * permanece no cadastro).
   */
  private evolucaoInativados(
    tx: TenantTx,
    empresaId: string,
    escopo: string[] | null,
    query: ConsultaEvolucaoQuery,
  ) {
    const mesDoBloqueio = Prisma.sql`(EXTRACT(YEAR FROM c."dataBloqueio")::int * 12 + EXTRACT(MONTH FROM c."dataBloqueio")::int)`;
    const condicoes: Prisma.Sql[] = [
      Prisma.sql`c."empresaId" = ${empresaId}`,
      Prisma.sql`c."deletedAt" IS NULL`,
      Prisma.sql`c."dataBloqueio" IS NOT NULL`,
      Prisma.sql`${mesDoBloqueio} BETWEEN ${emMeses(
        query.anoInicial,
        query.mesInicial,
      )} AND ${emMeses(query.anoFinal, query.mesFinal)}`,
      ...this.condicaoEscopoClientes(escopo),
      ...this.condicaoFiltroVendedor(
        Prisma.sql`c."vendedorId"`,
        escopo,
        query.vendedorIds,
      ),
    ];

    return tx.$queryRaw<LinhaAgregada[]>(Prisma.sql`
      SELECT
        ${this.selecaoVendedor},
        EXTRACT(YEAR FROM c."dataBloqueio")::int  AS "ano",
        EXTRACT(MONTH FROM c."dataBloqueio")::int AS "mes",
        COUNT(*)::float8 AS "valor"
      FROM "clientes" c
      JOIN "vendedores" v ON v."id" = c."vendedorId" AND v."deletedAt" IS NULL
      WHERE ${Prisma.join(condicoes, ' AND ')}
      GROUP BY ${this.agrupamentoVendedor},
        EXTRACT(YEAR FROM c."dataBloqueio"), EXTRACT(MONTH FROM c."dataBloqueio")
    `);
  }
}
