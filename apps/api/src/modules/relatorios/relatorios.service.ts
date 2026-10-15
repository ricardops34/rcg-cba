import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  RelatorioComprasLinha,
  RelatorioComprasQuery,
  RelatorioEstoqueCompraLinha,
  RelatorioEstoqueCompraQuery,
  RelatorioEstoqueCompraResultado,
  RelatorioOpcao,
  RelatorioOpcaoTipo,
  RelatorioResultado,
  RelatorioVendasLinha,
  RelatorioVendasPorVendedorLinha,
  RelatorioVendasPorVendedorMes,
  RelatorioVendasPorVendedorQuery,
  RelatorioVendasPorVendedorResultado,
  RelatorioVendasQuery,
} from '@plataforma/contracts';
import {
  PARAMETRO_RELATORIO_VENDAS_QUEBRA_VENDEDOR,
  RELATORIO_OPCOES_LIMITE,
} from '@plataforma/contracts';
import { condicaoBuscaTermosSql } from '../../common/busca/termos-busca';
import { PrismaService } from '../../common/prisma/prisma.service';
import { corteDeVenda } from '../../common/vendas/venda-analitica';
import { ParametrosService } from '../parametros/parametros.service';

const DIA = 24 * 60 * 60 * 1000;
/** Tempo máximo de uma leitura de relatório. */
const TEMPO_MAXIMO_MS = 60_000;
/** Mês médio, para a média de saída por mês. */
const DIAS_POR_MES = 30.44;

/** Período civil fechado: do início do primeiro dia ao fim do último. */
export function periodo(inicio: string, fim: string) {
  const de = new Date(`${inicio}T00:00:00.000Z`);
  const ate = new Date(new Date(`${fim}T00:00:00.000Z`).getTime() + DIA);
  if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime()) || ate <= de) {
    throw new BadRequestException(
      'Período inválido: o fim precisa ser igual ou depois do início.',
    );
  }
  return { de, ate };
}

/**
 * O que é **compra** (decisão do usuário, 2026-10-14): NF de entrada do tipo
 * normal, de mercadoria. Fora: CT-e/CTR (frete), NFS/RPS/NFPS (serviço),
 * energia (NF3E, NFCEE), telecom (NTST, NFSC, NTSC), cupom (NFCE), fatura
 * (NFFA) e devolução de cliente (tipo D). Espécies vistas na base da RCG.
 */
export const ESPECIES_DE_COMPRA = ['SPED', 'NFE', 'NF', 'NFA'];
/**
 * E de fornecedor **ativo** (decisão do usuário, 14/10/2026, só para os
 * relatórios): bloqueado no ERP (A2_MSBLQL = 1) não sai nem na lista do filtro
 * nem nos itens — Compras, Entrada-Qtd e o fornecedor/preço da última compra.
 *
 * E que **gerou contas a pagar** (F1_DUPL; usuário, 14/10/2026), como a venda
 * pelo F2_DUPL. `geraDuplicata` nulo — a nota chegou antes de o BJPLA003
 * mandar o campo — continua entrando: senão o relatório zeraria até a
 * integração reenviar as notas. Escrito pelo lado de quem passa (true ou
 * nulo), pela armadilha do `NOT` com nulo descrita em `venda-analitica.ts`.
 */
const NOTA_DE_COMPRA_SQL = Prisma.sql`n."tipo" = 'N' AND n."especieFiscal" IN (${Prisma.join(ESPECIES_DE_COMPRA)})
  AND n."geraDuplicata" IS DISTINCT FROM false
  AND EXISTS (SELECT 1 FROM "fornecedores" fa WHERE fa."id" = n."fornecedorId" AND fa."ativo" = true)`;

/** Produto de uma das categorias ou subcategorias escolhidas. */
const dasCategorias = (ids: string[]): Prisma.ProdutoWhereInput => ({
  OR: [{ categoriaId: { in: ids } }, { subCategoriaId: { in: ids } }],
});

/**
 * Relatório só traz produto de categoria marcada como **Usada** (decisão do
 * usuário, 14/10/2026, só para os relatórios). Mais estrito que o
 * `corteDeVenda` do Dashboard, onde categoria em branco conta: aqui em branco
 * fica de fora — por isso o Relatório de Vendas pode dar menos que o Dashboard.
 */
const DE_CATEGORIA_USADA: Prisma.ProdutoWhereInput = {
  categoria: { is: { usado: true } },
};
const DE_CATEGORIA_USADA_SQL = Prisma.sql`EXISTS (SELECT 1 FROM "categorias" cu WHERE cu."id" = p."categoriaId" AND cu."usado" = true)`;

/** CNPJ/CPF só com dígitos, para casar a busca com ou sem pontuação. */
const SO_DIGITOS = (coluna: Prisma.Sql) =>
  Prisma.sql`regexp_replace(COALESCE(${coluna}, ''), '[^0-9]', '', 'g')`;

const contem = (texto: string) => ({
  contains: texto,
  mode: 'insensitive' as const,
});
const dataIso = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;
const arred = (v: number, casas = 2) =>
  Math.round(v * 10 ** casas) / 10 ** casas;

type Sentido = 'asc' | 'desc';

/**
 * Ordenação pela coluna clicada na tela: o campo da linha → o `orderBy` do
 * Prisma. Fora da lista (ou sem ordem), só a padrão. A padrão vem depois como
 * desempate — a página seguinte não repete nem pula linhas.
 */
export const ORDEM_COMPRAS: Record<
  string,
  (s: Sentido) => Prisma.NotaEntradaItemOrderByWithRelationInput
> = {
  documento: (s) => ({ notaEntrada: { numero: s } }),
  produtoCodigo: (s) => ({ produto: { codigoErp: s } }),
  descricao: (s) => ({ produto: { descricao: s } }),
  quantidade: (s) => ({ quantidade: s }),
  unidade: (s) => ({ produto: { unidade: s } }),
  vlrUnitario: (s) => ({ vlrUnitario: s }),
  aliqIpi: (s) => ({ aliqIpi: s }),
  vlrTotal: (s) => ({ vlrTotal: s }),
  aliqIcms: (s) => ({ aliqIcms: s }),
  vlrIpi: (s) => ({ vlrIpi: s }),
  vlrIcms: (s) => ({ vlrIcms: s }),
  vlrIcmsSt: (s) => ({ vlrIcmsSt: s }),
  codigoForCli: (s) => ({ fornecedor: { codigoErp: s } }),
  razaoSocial: (s) => ({ fornecedor: { razaoSocial: s } }),
  dtDigitacao: (s) => ({ notaEntrada: { dtEntrada: s } }),
};

const ORDEM_VENDAS: Record<
  string,
  (s: Sentido) => Prisma.NotaSaidaItemOrderByWithRelationInput
> = {
  vendedor: (s) => ({ notaSaida: { vendedor: { nome: s } } }),
  clienteCodigo: (s) => ({ notaSaida: { cliente: { codigoErp: s } } }),
  clienteNome: (s) => ({ notaSaida: { cliente: { razaoSocial: s } } }),
  municipio: (s) => ({ notaSaida: { cliente: { municipio: s } } }),
  emissao: (s) => ({ notaSaida: { dtEmissao: s } }),
  notaFiscal: (s) => ({ notaSaida: { numero: s } }),
  produtoCodigo: (s) => ({ produto: { codigoErp: s } }),
  produto: (s) => ({ produto: { descricao: s } }),
  quantidade: (s) => ({ quantidade: s }),
  vlrProduto: (s) => ({ vlrUnitario: s }),
  vlrItem: (s) => ({ vlrTotal: s }),
};

export function ordenar<O>(
  mapa: Record<string, (s: Sentido) => O>,
  q: { ordem?: string; sentido: Sentido },
  padrao: O[],
): O[] {
  const escolhida =
    q.ordem && Object.hasOwn(mapa, q.ordem) ? mapa[q.ordem](q.sentido) : null;
  return escolhida ? [escolhida, ...padrao] : padrao;
}

function paginar(total: number, page: number, pageSize: number) {
  return {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Relatórios — ver `docs/planos/2026-10-13-modulo-relatorios.md`. Toda
 * leitura passa por `withTenant` da empresa ativa.
 */
@Injectable()
export class RelatoriosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
  ) {}

  /**
   * Leitura no contexto da empresa com mais tempo que o padrão do Prisma
   * (5 s): relatório de período longo numa base grande passa disso, e a
   * transação expirava no meio (visto em dev, vendas da RCG em 9 meses).
   */
  private ler<T>(
    empresaId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.withTenant(empresaId, fn, { timeout: TEMPO_MAXIMO_MS });
  }

  /**
   * Compras: itens das notas de **compra** (`ESPECIES_DE_COMPRA`, tipo
   * normal) não canceladas, no período da data de digitação (`dtEntrada`; a
   * de emissão quando a nota não tem entrada).
   */
  async compras(
    empresaId: string,
    q: RelatorioComprasQuery,
  ): Promise<RelatorioResultado<RelatorioComprasLinha>> {
    const { de, ate } = periodo(q.inicio, q.fim);
    const filtros: Prisma.NotaEntradaItemWhereInput[] = [
      { empresaId, deletedAt: null, ativo: true },
      {
        notaEntrada: {
          is: {
            deletedAt: null,
            ativo: true,
            tipo: 'N',
            especieFiscal: { in: ESPECIES_DE_COMPRA },
            fornecedor: { is: { ativo: true } },
            AND: [
              {
                OR: [
                  { dtEntrada: { gte: de, lt: ate } },
                  { dtEntrada: null, dtEmissao: { gte: de, lt: ate } },
                ],
              },
              // Gerou contas a pagar, ou ainda não informado (NOTA_DE_COMPRA_SQL).
              { OR: [{ geraDuplicata: true }, { geraDuplicata: null }] },
            ],
          },
        },
      },
      { produto: { is: DE_CATEGORIA_USADA } },
    ];
    if (q.categoriaIds?.length)
      filtros.push({ produto: { is: dasCategorias(q.categoriaIds) } });
    if (q.documento)
      filtros.push({ notaEntrada: { is: { numero: contem(q.documento) } } });
    if (q.produtoIds?.length) filtros.push({ produtoId: { in: q.produtoIds } });
    // Nota de compra é tipo N: o participante é sempre fornecedor.
    if (q.fornecedorIds?.length)
      filtros.push({ fornecedorId: { in: q.fornecedorIds } });
    const where: Prisma.NotaEntradaItemWhereInput = { AND: filtros };

    return this.ler(empresaId, async (tx) => {
      // Em sequência: consulta paralela numa transação interativa não é
      // garantida pelo Prisma.
      const total = await tx.notaEntradaItem.count({ where });
      const somas = await tx.notaEntradaItem.aggregate({
        where,
        _sum: {
          quantidade: true,
          vlrTotal: true,
          vlrIpi: true,
          vlrIcms: true,
          vlrIcmsSt: true,
        },
      });
      const itens = await tx.notaEntradaItem.findMany({
        where,
        orderBy: ordenar(ORDEM_COMPRAS, q, [
          { notaEntrada: { dtEntrada: 'asc' } },
          { notaEntrada: { numero: 'asc' } },
          { item: 'asc' },
          { id: 'asc' },
        ]),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          quantidade: true,
          vlrUnitario: true,
          vlrTotal: true,
          aliqIpi: true,
          aliqIcms: true,
          vlrIpi: true,
          vlrIcms: true,
          vlrIcmsSt: true,
          notaEntrada: {
            select: {
              numero: true,
              serie: true,
              dtEntrada: true,
              dtEmissao: true,
            },
          },
          produto: {
            select: { codigoErp: true, descricao: true, unidade: true },
          },
          fornecedor: { select: { codigoErp: true, razaoSocial: true } },
          cliente: { select: { codigoErp: true, razaoSocial: true } },
        },
      });
      const linhas = itens.map((i): RelatorioComprasLinha => {
        const quem = i.fornecedor ?? i.cliente;
        return {
          id: i.id,
          documento: i.notaEntrada.numero,
          serie: i.notaEntrada.serie,
          produtoCodigo: i.produto?.codigoErp ?? null,
          descricao: i.produto?.descricao ?? null,
          quantidade: i.quantidade,
          unidade: i.produto?.unidade ?? null,
          vlrUnitario: i.vlrUnitario,
          aliqIpi: i.aliqIpi,
          vlrTotal: i.vlrTotal,
          aliqIcms: i.aliqIcms,
          vlrIpi: i.vlrIpi,
          vlrIcms: i.vlrIcms,
          vlrIcmsSt: i.vlrIcmsSt,
          codigoForCli: quem?.codigoErp ?? null,
          razaoSocial: quem?.razaoSocial ?? null,
          dtDigitacao: dataIso(
            i.notaEntrada.dtEntrada ?? i.notaEntrada.dtEmissao,
          ),
        };
      });
      return {
        linhas,
        ...paginar(total, q.page, q.pageSize),
        totais: {
          quantidade: arred(somas._sum.quantidade ?? 0, 4),
          vlrTotal: arred(somas._sum.vlrTotal ?? 0),
          vlrIpi: arred(somas._sum.vlrIpi ?? 0),
          vlrIcms: arred(somas._sum.vlrIcms ?? 0),
          vlrIcmsSt: arred(somas._sum.vlrIcmsSt ?? 0),
        },
      };
    });
  }

  /**
   * Vendas por vendedor: itens de venda no período de emissão, pelo mesmo
   * critério das Consultas e do Dashboard (`corteDeVenda`) — os números
   * batem entre as telas.
   */
  async vendas(
    empresaId: string,
    q: RelatorioVendasQuery,
  ): Promise<RelatorioResultado<RelatorioVendasLinha>> {
    const { de, ate } = periodo(q.inicio, q.fim);
    return this.ler(empresaId, async (tx) => {
      const corte = await corteDeVenda(tx, empresaId);
      const filtros: Prisma.NotaSaidaItemWhereInput[] = [
        { empresaId },
        corte.item,
        { notaSaida: { is: { dtEmissao: { gte: de, lt: ate } } } },
      ];
      if (q.vendedorIds?.length) {
        filtros.push({
          notaSaida: { is: { vendedorId: { in: q.vendedorIds } } },
        });
      }
      if (q.clienteIds?.length) {
        filtros.push({
          notaSaida: { is: { clienteId: { in: q.clienteIds } } },
        });
      }
      if (q.municipio) {
        filtros.push({
          notaSaida: {
            is: { cliente: { is: { municipio: contem(q.municipio) } } },
          },
        });
      }
      filtros.push({ produto: { is: DE_CATEGORIA_USADA } });
      if (q.categoriaIds?.length)
        filtros.push({ produto: { is: dasCategorias(q.categoriaIds) } });
      if (q.notaFiscal)
        filtros.push({ notaSaida: { is: { numero: contem(q.notaFiscal) } } });
      if (q.produtoIds?.length)
        filtros.push({ produtoId: { in: q.produtoIds } });
      const where: Prisma.NotaSaidaItemWhereInput = { AND: filtros };

      const total = await tx.notaSaidaItem.count({ where });
      const somas = await tx.notaSaidaItem.aggregate({
        where,
        _sum: { quantidade: true, vlrTotal: true },
      });
      const itens = await tx.notaSaidaItem.findMany({
        where,
        orderBy: ordenar(ORDEM_VENDAS, q, [
          { notaSaida: { vendedor: { nome: 'asc' } } },
          { notaSaida: { dtEmissao: 'asc' } },
          { notaSaida: { numero: 'asc' } },
          { item: 'asc' },
          { id: 'asc' },
        ]),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          quantidade: true,
          vlrUnitario: true,
          vlrTotal: true,
          produto: { select: { codigoErp: true, descricao: true } },
          notaSaida: {
            select: {
              numero: true,
              dtEmissao: true,
              vendedor: { select: { nome: true, nomeReduzido: true } },
              cliente: {
                select: { codigoErp: true, razaoSocial: true, municipio: true },
              },
            },
          },
        },
      });
      const linhas = itens.map((i): RelatorioVendasLinha => ({
        id: i.id,
        vendedor:
          i.notaSaida.vendedor?.nomeReduzido ||
          i.notaSaida.vendedor?.nome ||
          null,
        clienteCodigo: i.notaSaida.cliente?.codigoErp ?? null,
        clienteNome: i.notaSaida.cliente?.razaoSocial ?? null,
        municipio: i.notaSaida.cliente?.municipio ?? null,
        emissao: dataIso(i.notaSaida.dtEmissao),
        notaFiscal: i.notaSaida.numero,
        produtoCodigo: i.produto?.codigoErp ?? null,
        produto: i.produto?.descricao ?? null,
        quantidade: i.quantidade,
        vlrProduto: i.vlrUnitario,
        vlrItem: i.vlrTotal,
      }));
      return {
        linhas,
        ...paginar(total, q.page, q.pageSize),
        totais: {
          quantidade: arred(somas._sum.quantidade ?? 0, 4),
          vlrItem: arred(somas._sum.vlrTotal ?? 0),
        },
      };
    });
  }

  /**
   * Vendas por vendedor, mensal: uma linha por cliente (e vendedor, sempre
   * apurado — a tela decide se agrupa), uma coluna por mês do período. Mesmo
   * corte de venda das outras telas (`corteDeVenda`, categoria "usada").
   *
   * Período limitado a `RELATORIO_VENDAS_POR_VENDEDOR_MAX_MESES`: é uma
   * matriz cliente × mês, e sem o teto uma consulta de anos vira uma grade
   * larga demais para a tela e para o Excel/PDF.
   */
  async vendasPorVendedor(
    empresaId: string,
    q: RelatorioVendasPorVendedorQuery,
  ): Promise<RelatorioVendasPorVendedorResultado> {
    const { de, ate } = periodo(q.inicio, q.fim);

    const meses: string[] = [];
    let ano = Number(q.inicio.slice(0, 4));
    let mes = Number(q.inicio.slice(5, 7));
    const anoFim = Number(q.fim.slice(0, 4));
    const mesFim = Number(q.fim.slice(5, 7));
    while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
      meses.push(`${ano}-${String(mes).padStart(2, '0')}`);
      mes += 1;
      if (mes > 12) {
        mes = 1;
        ano += 1;
      }
    }

    const filtros: Prisma.Sql[] = [
      Prisma.sql`i."empresaId" = ${empresaId}`,
      Prisma.sql`i."deletedAt" IS NULL`,
      Prisma.sql`i."ativo" = true`,
      DE_CATEGORIA_USADA_SQL,
    ];
    if (q.vendedorIds?.length)
      filtros.push(Prisma.sql`n."vendedorId" IN (${Prisma.join(q.vendedorIds)})`);
    if (q.clienteIds?.length)
      filtros.push(Prisma.sql`n."clienteId" IN (${Prisma.join(q.clienteIds)})`);
    if (q.produtoIds?.length)
      filtros.push(Prisma.sql`i."produtoId" IN (${Prisma.join(q.produtoIds)})`);
    if (q.categoriaIds?.length) {
      const cats = Prisma.join(q.categoriaIds);
      filtros.push(
        Prisma.sql`(p."categoriaId" IN (${cats}) OR p."subCategoriaId" IN (${cats}))`,
      );
    }

    const { brutas, quebraPorVendedor } = await this.ler(empresaId, async (tx) => {
      const corte = await corteDeVenda(tx, empresaId);
      const brutas = await tx.$queryRaw<
        {
          vendedorId: string | null;
          vendedor: string | null;
          clienteId: string;
          clienteCodigo: string | null;
          clienteNome: string | null;
          mes: string;
          quantidade: number;
          valor: number;
        }[]
      >`
        SELECT n."vendedorId" AS "vendedorId",
               COALESCE(v."nomeReduzido", v."nome") AS "vendedor",
               n."clienteId" AS "clienteId",
               c."codigoErp" AS "clienteCodigo",
               c."razaoSocial" AS "clienteNome",
               to_char(n."dtEmissao", 'YYYY-MM') AS "mes",
               SUM(i."quantidade")::float8 AS "quantidade",
               SUM(i."vlrTotal")::float8 AS "valor"
        FROM "notas_saida_itens" i
        JOIN "notas_saida" n ON n."id" = i."notaSaidaId"
        JOIN "produtos" p ON p."id" = i."produtoId"
        LEFT JOIN "vendedores" v ON v."id" = n."vendedorId"
        LEFT JOIN "clientes" c ON c."id" = n."clienteId"
        WHERE ${Prisma.join(filtros, ' AND ')}
          AND ${Prisma.join(corte.notaSql, ' AND ')}
          AND n."dtEmissao" >= ${de} AND n."dtEmissao" < ${ate}
        -- "mes" não pode ir pelo alias no GROUP BY/ORDER BY: notas_saida_itens
        -- já tem uma coluna própria "mes" (do ERP), e o bare "mes" fica
        -- ambíguo entre ela e o alias da expressão.
        GROUP BY n."vendedorId", v."nomeReduzido", v."nome", n."clienteId",
                 c."codigoErp", c."razaoSocial", to_char(n."dtEmissao", 'YYYY-MM')
        ORDER BY "vendedor" NULLS LAST, "clienteNome", to_char(n."dtEmissao", 'YYYY-MM')`;
      // Controle da tela tem prioridade; sem ele, vale o parâmetro da empresa.
      const quebraPorVendedor =
        q.quebraPorVendedor ??
        (await this.parametros.obterBoolean(
          empresaId,
          PARAMETRO_RELATORIO_VENDAS_QUEBRA_VENDEDOR,
          true,
          tx,
        ));
      return { brutas, quebraPorVendedor };
    });

    const porChave = new Map<string, RelatorioVendasPorVendedorLinha>();
    for (const b of brutas) {
      const chave = `${b.vendedorId ?? ''}::${b.clienteId}`;
      let linha = porChave.get(chave);
      if (!linha) {
        linha = {
          vendedorId: b.vendedorId,
          vendedor: b.vendedor,
          clienteId: b.clienteId,
          clienteCodigo: b.clienteCodigo,
          clienteNome: b.clienteNome,
          meses: meses.map((m): RelatorioVendasPorVendedorMes => ({ mes: m, quantidade: 0, valor: 0 })),
          totalQuantidade: 0,
          totalValor: 0,
        };
        porChave.set(chave, linha);
      }
      const item = linha.meses.find((m) => m.mes === b.mes);
      if (item) {
        item.quantidade = arred(b.quantidade, 4);
        item.valor = arred(b.valor);
      }
      linha.totalQuantidade = arred(linha.totalQuantidade + b.quantidade, 4);
      linha.totalValor = arred(linha.totalValor + b.valor);
    }

    const linhas = [...porChave.values()];
    return {
      meses,
      quebraPorVendedor,
      linhas,
      totalQuantidade: arred(linhas.reduce((s, l) => s + l.totalQuantidade, 0), 4),
      totalValor: arred(linhas.reduce((s, l) => s + l.totalValor, 0)),
    };
  }

  /**
   * Estoque e compra, por produto:
   * - **Estoque**: soma dos armazéns de revenda;
   * - **Entrada-Qtd**: itens das notas de compra (`ESPECIES_DE_COMPRA`) no período;
   * - **Saída-Qtd**: itens das notas de **venda** no período (cabeçalho de
   *   `corteDeVenda`), sem o filtro de categoria "usada nas análises" — esse
   *   é das análises de venda; aqui zeraria a saída de produto que sai;
   * - **Fornecedor**: o da última nota de compra (sem o CT-e de frete);
   * - **Últ. preço**: o unitário da última nota de compra (o do cadastro é o
   *   preço de venda, B1_PRV1);
   * - **Média** = saída ÷ meses do período; **a comprar** = média × meses de
   *   compra − estoque (negativo = sobra), como na planilha da compra.
   */
  async estoqueCompra(
    empresaId: string,
    q: RelatorioEstoqueCompraQuery,
  ): Promise<RelatorioEstoqueCompraResultado> {
    const { de, ate } = periodo(q.inicio, q.fim);
    // Atalho da tela (3, 4, 5, 6 meses): divide pelo número de meses, como a
    // planilha. Datas livres: pelos dias.
    const mesesPeriodo =
      q.mesesPeriodo ?? (ate.getTime() - de.getTime()) / DIA / DIAS_POR_MES;

    const filtros: Prisma.Sql[] = [
      Prisma.sql`p."empresaId" = ${empresaId}`,
      Prisma.sql`p."deletedAt" IS NULL`,
      DE_CATEGORIA_USADA_SQL,
    ];
    if (q.produtoIds?.length)
      filtros.push(Prisma.sql`p."id" IN (${Prisma.join(q.produtoIds)})`);
    if (q.categoriaIds?.length) {
      const cats = Prisma.join(q.categoriaIds);
      filtros.push(
        Prisma.sql`(p."categoriaId" IN (${cats}) OR p."subCategoriaId" IN (${cats}))`,
      );
    }
    if (q.codigoCorp)
      filtros.push(
        Prisma.sql`p."codigoFabricante" ILIKE ${`%${q.codigoCorp}%`}`,
      );
    if (q.fornecedorIds?.length)
      filtros.push(
        Prisma.sql`ult."fornecedorId" IN (${Prisma.join(q.fornecedorIds)})`,
      );
    if (q.comMovimento) {
      filtros.push(
        Prisma.sql`(COALESCE(est."saldo", 0) <> 0 OR COALESCE(ent."qtd", 0) <> 0 OR COALESCE(sai."qtd", 0) <> 0)`,
      );
    } else {
      // Produto inativo sem nada para mostrar não entra.
      filtros.push(
        Prisma.sql`(p."ativo" OR COALESCE(est."saldo", 0) <> 0 OR COALESCE(ent."qtd", 0) <> 0 OR COALESCE(sai."qtd", 0) <> 0)`,
      );
    }

    const linhas = await this.ler(empresaId, async (tx) => {
      const corte = await corteDeVenda(tx, empresaId);
      return tx.$queryRaw<
        {
          produtoId: string;
          codigo: string;
          descricao: string;
          codigoCorp: string | null;
          fornecedor: string | null;
          estoque: number;
          entradas: number;
          saidas: number;
          ultimoPreco: number | null;
        }[]
      >`
        WITH est AS (
          SELECT e."produtoId", SUM(e."saldo") AS "saldo"
          FROM "estoques" e
          JOIN "armazens" a ON a."id" = e."armazemId"
          WHERE e."empresaId" = ${empresaId} AND e."deletedAt" IS NULL AND a."revenda" = true
          GROUP BY e."produtoId"
        ),
        ent AS (
          SELECT i."produtoId", SUM(i."quantidade") AS "qtd"
          FROM "notas_entrada_itens" i
          JOIN "notas_entrada" n ON n."id" = i."notaEntradaId"
          WHERE i."empresaId" = ${empresaId} AND i."deletedAt" IS NULL AND i."ativo" = true
            AND n."deletedAt" IS NULL AND n."ativo" = true AND ${NOTA_DE_COMPRA_SQL}
            AND COALESCE(n."dtEntrada", n."dtEmissao") >= ${de}
            AND COALESCE(n."dtEntrada", n."dtEmissao") < ${ate}
          GROUP BY i."produtoId"
        ),
        sai AS (
          SELECT i."produtoId", SUM(i."quantidade") AS "qtd"
          FROM "notas_saida_itens" i
          JOIN "notas_saida" n ON n."id" = i."notaSaidaId"
          WHERE i."empresaId" = ${empresaId} AND i."deletedAt" IS NULL AND i."ativo" = true
            AND ${Prisma.join(corte.notaSql, ' AND ')}
            AND n."dtEmissao" >= ${de} AND n."dtEmissao" < ${ate}
          GROUP BY i."produtoId"
        )
        SELECT p."id" AS "produtoId", p."codigoErp" AS "codigo", p."descricao",
               p."codigoFabricante" AS "codigoCorp", ult."fornecedor",
               COALESCE(est."saldo", 0)::float8 AS "estoque",
               COALESCE(ent."qtd", 0)::float8 AS "entradas",
               COALESCE(sai."qtd", 0)::float8 AS "saidas",
               -- Preço unitário da última nota de compra (decisão do usuário,
               -- 2026-10-13). O "ultimoPreco" do cadastro é o B1_PRV1, preço de
               -- venda — não serve aqui.
               ult."precoCompra" AS "ultimoPreco"
        FROM "produtos" p
        LEFT JOIN est ON est."produtoId" = p."id"
        LEFT JOIN ent ON ent."produtoId" = p."id"
        LEFT JOIN sai ON sai."produtoId" = p."id"
        -- Última **compra**, por produto (LATERAL, não CTE): calculada só
        -- para os produtos que sobrevivem ao filtro, em vez de ordenar o
        -- histórico de compra inteiro da empresa a cada "Gerar" — era o
        -- gargalo do relatório (2026-10-15). Nota normal com quantidade; o
        -- CT-e da transportadora (tipo C, quantidade 0) leva o código do
        -- produto no ERP e virava o "fornecedor" — visto em dev em 2026-10-13.
        LEFT JOIN LATERAL (
          SELECT f."id" AS "fornecedorId", f."razaoSocial" AS "fornecedor",
                 i."vlrUnitario" AS "precoCompra"
          FROM "notas_entrada_itens" i
          JOIN "notas_entrada" n ON n."id" = i."notaEntradaId"
          JOIN "fornecedores" f ON f."id" = n."fornecedorId"
          WHERE i."produtoId" = p."id"
            AND i."empresaId" = ${empresaId} AND i."deletedAt" IS NULL AND i."ativo" = true
            AND n."deletedAt" IS NULL AND n."ativo" = true
            AND ${NOTA_DE_COMPRA_SQL}
            AND i."quantidade" > 0
          ORDER BY COALESCE(n."dtEntrada", n."dtEmissao") DESC NULLS LAST, i."vlrUnitario" DESC
          LIMIT 1
        ) ult ON true
        WHERE ${Prisma.join(filtros, ' AND ')}
        ORDER BY p."codigoErp"`;
    });

    return {
      mesesPeriodo: arred(mesesPeriodo, 2),
      mesesCompra: q.mesesCompra,
      linhas: linhas.map((l): RelatorioEstoqueCompraLinha => {
        const media = mesesPeriodo > 0 ? l.saidas / mesesPeriodo : 0;
        return {
          ...l,
          estoque: arred(l.estoque, 4),
          entradas: arred(l.entradas, 4),
          saidas: arred(l.saidas, 4),
          media: arred(media, 2),
          aComprar: arred(media * q.mesesCompra - l.estoque, 1),
        };
      }),
    };
  }

  /**
   * Opções dos filtros de produto, fornecedor e cliente: busca por termos no
   * código, nome, CNPJ/CPF (com ou sem pontuação) e, no produto, Cod. Corp. e
   * código de barras. Inativos entram depois — relatório olha o passado.
   */
  async opcoes(
    empresaId: string,
    tipo: RelatorioOpcaoTipo,
    busca: string | undefined,
  ): Promise<RelatorioOpcao[]> {
    const tabela = {
      produtos: {
        sql: Prisma.sql`SELECT t."id", t."codigoErp" AS "codigo", t."descricao" AS "nome",
                 NULLIF(CONCAT_WS(' · ',
                   CASE WHEN t."codigoFabricante" <> '' THEN 'Cod. Corp. ' || t."codigoFabricante" END,
                   CASE WHEN t."codigoNoFabricante" <> '' THEN 'Fabric. ' || t."codigoNoFabricante" END,
                   CASE WHEN t."produtoAllia" THEN 'Allia' END,
                   CASE WHEN NOT t."ativo" THEN 'inativo' END), '') AS "detalhe",
                 t."ativo"
          FROM "produtos" t`,
        ordem: Prisma.sql`t."ativo" DESC, t."descricao"`,
        colunas: [
          Prisma.sql`t."codigoErp"`,
          Prisma.sql`t."descricao"`,
          Prisma.sql`t."codigoFabricante"`,
          Prisma.sql`t."codigoNoFabricante"`,
          Prisma.sql`t."descricaoNoFabricante"`,
          Prisma.sql`t."codigoBarras"`,
        ],
      },
      fornecedores: {
        sql: Prisma.sql`SELECT t."id", t."codigoErp" AS "codigo", t."razaoSocial" AS "nome",
                 NULLIF(CONCAT_WS(' · ', t."cnpjCpf",
                   NULLIF(CONCAT_WS('/', t."municipio", t."uf"), ''),
                   CASE WHEN NOT t."ativo" THEN 'inativo' END), '') AS "detalhe",
                 t."ativo"
          FROM "fornecedores" t`,
        ordem: Prisma.sql`t."ativo" DESC, t."razaoSocial"`,
        colunas: [
          Prisma.sql`t."codigoErp"`,
          Prisma.sql`t."razaoSocial"`,
          Prisma.sql`t."nomeFantasia"`,
          Prisma.sql`t."cnpjCpf"`,
          SO_DIGITOS(Prisma.sql`t."cnpjCpf"`),
        ],
      },
      clientes: {
        sql: Prisma.sql`SELECT t."id", t."codigoErp" AS "codigo", t."razaoSocial" AS "nome",
                 NULLIF(CONCAT_WS(' · ', t."cnpjCpf",
                   NULLIF(CONCAT_WS('/', t."municipio", t."uf"), ''),
                   CASE WHEN NOT t."ativo" THEN 'inativo' END), '') AS "detalhe",
                 t."ativo"
          FROM "clientes" t`,
        ordem: Prisma.sql`t."ativo" DESC, t."razaoSocial"`,
        colunas: [
          Prisma.sql`t."codigoErp"`,
          Prisma.sql`t."razaoSocial"`,
          Prisma.sql`t."nomeFantasia"`,
          Prisma.sql`t."cnpjCpf"`,
          SO_DIGITOS(Prisma.sql`t."cnpjCpf"`),
        ],
      },
    }[tipo];

    const condicoes = [
      Prisma.sql`t."empresaId" = ${empresaId}`,
      Prisma.sql`t."deletedAt" IS NULL`,
    ];
    // Produto que o relatório nunca traz não aparece para escolher.
    if (tipo === 'produtos')
      condicoes.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "categorias" cu WHERE cu."id" = t."categoriaId" AND cu."usado" = true)`,
      );
    // Fornecedor bloqueado (A2_MSBLQL = 1 → ativo false) não aparece para
    // escolher (usuário, 14/10/2026). Só a lista: a nota antiga dele continua
    // no relatório.
    if (tipo === 'fornecedores') condicoes.push(Prisma.sql`t."ativo" = true`);
    const buscaSql = condicaoBuscaTermosSql(busca, tabela.colunas);
    if (buscaSql) condicoes.push(buscaSql);

    const linhas = await this.ler(
      empresaId,
      (tx) =>
        tx.$queryRaw<RelatorioOpcao[]>`
        ${tabela.sql}
        WHERE ${Prisma.join(condicoes, ' AND ')}
        ORDER BY ${tabela.ordem}
        LIMIT ${RELATORIO_OPCOES_LIMITE}`,
    );
    return linhas.map(({ id, codigo, nome, detalhe }) => ({
      id,
      codigo,
      nome,
      detalhe,
    }));
  }
}
