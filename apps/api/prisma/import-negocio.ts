/**
 * Importa o movimento comercial do sistema legado (MySQL rcgdistc_portal):
 * estoque, notas fiscais de saída, itens de nota e títulos a receber —
 * conectando direto via mysql2 em runtime, como os demais imports.
 *
 * Volumes grandes (≈67 mil notas, ≈168 mil itens, ≈37 mil títulos), então a
 * carga usa createMany em lotes com skipDuplicates sobre a chave
 * (empresaId, codigoLegado) — idempotente: reexecutar não duplica (linhas já
 * importadas são puladas; para ressincronizar valores, limpe as tabelas e
 * rode de novo). Estoque (≈7 mil) usa upsert por (produto, armazém) e
 * atualiza os saldos a cada execução.
 *
 * Pré-requisitos (nesta ordem): seed → import-auxiliares (categorias,
 * armazéns, condições) → import-legado (produtos, vendedores) →
 * import-clientes → este script.
 *
 * Rodar (a partir da raiz do repo):
 *   pnpm --filter @plataforma/api exec ts-node prisma/import-negocio.ts
 * Dentro do container api (MySQL na rede do compose):
 *   MYSQL_HOST=mysql MYSQL_PORT=3306 pnpm --filter @plataforma/api exec ts-node prisma/import-negocio.ts
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import * as mysql from 'mysql2/promise';

const prisma = new PrismaClient();

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST ?? 'localhost',
  port: Number(process.env.MYSQL_PORT ?? 3307),
  user: process.env.MYSQL_USER ?? 'rcg',
  password: process.env.MYSQL_PASSWORD ?? 'rcg',
  database: process.env.MYSQL_DATABASE ?? 'rcgdistc_portal',
  dateStrings: true as const,
};

const ALIAS_EMPRESA = 'rcg';
const LOTE = 1000;

const texto = (v: string | null | undefined): string | null => {
  if (v == null) return null;
  const t = v.trim();
  return t === '' ? null : t;
};

const data = (v: string | null | undefined): Date | null => {
  if (!v || v.startsWith('0000')) return null;
  const d = new Date(v.includes(' ') ? v.replace(' ', 'T') : `${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const inteiro = (v: string | null | undefined): number | null => {
  const n = Number(texto(v));
  return Number.isInteger(n) && n > 0 ? n : null;
};

interface LegadoEstoque {
  id: number;
  produto_id: number;
  armazem_id: number;
  saldo: number | null;
  reserva: number | null;
  custo: number | null;
  ult_preco: number | null;
  ult_compra: string | null;
}

interface LegadoNota {
  id: number;
  cliente_id: number | null;
  vendedor1_id: number | null;
  condicao_id: number | null;
  nota_fiscal: string | null;
  serie_fiscal: string | null;
  especie_fiscal: string | null;
  tipo: string | null;
  dt_emissao: string | null;
  ano: string | null;
  mes: string | null;
  vlr_bruto: number | null;
  vlr_mercadoria: number | null;
  vlr_itens: number | null;
  vlr_desconto: number | null;
  vlr_icms: number | null;
  vlr_ipi: number | null;
  vlr_frete: number | null;
  vlr_devolucao: number | null;
  chave_nfe: string | null;
  dt_nfe: string | null;
  mensagem_nf: string | null;
  comodato: string | null;
  reg_ativo: string | null;
}

interface LegadoItem {
  id: number;
  nota_saida_id: number;
  item: string | null;
  produto_id: number | null;
  cliente_id: number | null;
  vendedor1_id: number | null;
  dt_emissao: string | null;
  ano: string | null;
  mes: string | null;
  cfop: string | null;
  tipo: string | null;
  qtd: number | null;
  vlr_unitario: number | null;
  vlr_tabela: number | null;
  perc_desconto: number | null;
  vlr_desconto: number | null;
  vlr_total: number | null;
  qtd_dev: number | null;
  vlr_dev: number | null;
  peso: number | null;
  comodato: string | null;
  reg_ativo: string | null;
}

interface LegadoTitulo {
  id: number;
  cliente_id: number | null;
  vendedor_id: number | null;
  numero: string;
  parcela: string | null;
  prefixo: string | null;
  tipo: string | null;
  emissao: string | null;
  vencimento: string | null;
  venc_real: string | null;
  valor: number | null;
  saldo: number | null;
  acrescimo: number | null;
  decrescimo: number | null;
  baixa: string | null;
  forma_pgto: string | null;
  historico: string | null;
  reg_ativo: string | null;
}

interface RefRow {
  id: number;
  cod_erp: string | null;
}

/** id legado → id novo, casando por cod_erp (chave estável entre os sistemas). */
function montarMapa(
  legado: RefRow[],
  novosPorCodErp: Map<string, string>,
): Map<number, string> {
  const mapa = new Map<number, string>();
  for (const row of legado) {
    const codErp = texto(row.cod_erp);
    if (!codErp) continue;
    const novoId = novosPorCodErp.get(codErp);
    if (novoId) mapa.set(row.id, novoId);
  }
  return mapa;
}

async function main() {
  console.log(
    `Conectando ao MySQL legado em ${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database}...`,
  );
  const conexao = await mysql.createConnection(MYSQL_CONFIG);
  const [estoqueRows] = await conexao.query('SELECT * FROM estoque');
  const [notasRows] = await conexao.query('SELECT * FROM nota_saida');
  const [itensRows] = await conexao.query('SELECT * FROM nota_saida_item');
  const [titulosRows] = await conexao.query('SELECT * FROM titulo_receber');
  const [produtosRefRows] = await conexao.query('SELECT id, cod_erp FROM produto');
  const [armazensRefRows] = await conexao.query('SELECT id, cod_erp FROM armazem');
  const [clientesRefRows] = await conexao.query('SELECT id, cod_erp FROM cliente');
  const [vendedoresRefRows] = await conexao.query('SELECT id, cod_erp FROM vendedor');
  const [condicoesRefRows] = await conexao.query('SELECT id, cod_erp FROM condicao_pagamento');
  await conexao.end();

  const estoqueLegado = estoqueRows as LegadoEstoque[];
  const notasLegado = notasRows as LegadoNota[];
  const itensLegado = itensRows as LegadoItem[];
  const titulosLegado = titulosRows as LegadoTitulo[];
  console.log(
    `Legado: ${estoqueLegado.length} estoque, ${notasLegado.length} notas, ` +
      `${itensLegado.length} itens, ${titulosLegado.length} títulos.`,
  );

  const empresa = await prisma.empresa.findUnique({ where: { alias: ALIAS_EMPRESA } });
  if (!empresa) {
    throw new Error(`Empresa com alias "${ALIAS_EMPRESA}" não encontrada — rode o seed antes.`);
  }
  const empresaId = empresa.id;

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${empresaId}, true)`;

      const [produtosNovos, armazensNovos, clientesNovos, vendedoresNovos, condicoesNovas] =
        await Promise.all([
          tx.produto.findMany({ where: { empresaId }, select: { id: true, codigoErp: true } }),
          tx.armazem.findMany({ where: { empresaId }, select: { id: true, codigoErp: true } }),
          tx.cliente.findMany({ where: { empresaId }, select: { id: true, codigoErp: true } }),
          tx.vendedor.findMany({ where: { empresaId }, select: { id: true, codigoErp: true } }),
          tx.condicaoPagamento.findMany({
            where: { empresaId },
            select: { id: true, codigoErp: true },
          }),
        ]);
      const porCodErp = (rows: { id: string; codigoErp: string | null }[]) =>
        new Map(rows.filter((r) => r.codigoErp).map((r) => [r.codigoErp as string, r.id]));

      const produtoMapa = montarMapa(produtosRefRows as RefRow[], porCodErp(produtosNovos));
      const armazemMapa = montarMapa(armazensRefRows as RefRow[], porCodErp(armazensNovos));
      const clienteMapa = montarMapa(clientesRefRows as RefRow[], porCodErp(clientesNovos));
      const vendedorMapa = montarMapa(vendedoresRefRows as RefRow[], porCodErp(vendedoresNovos));
      const condicaoMapa = montarMapa(condicoesRefRows as RefRow[], porCodErp(condicoesNovas));

      // --- Estoque: upsert por (produto, armazém), atualiza saldo sempre ---
      let estoqueGravado = 0;
      let estoqueSemRef = 0;
      for (let i = 0; i < estoqueLegado.length; i += 200) {
        const chunk = estoqueLegado.slice(i, i + 200);
        await Promise.all(
          chunk.map((e) => {
            const produtoId = produtoMapa.get(e.produto_id);
            const armazemId = armazemMapa.get(e.armazem_id);
            if (!produtoId || !armazemId) {
              estoqueSemRef++;
              return Promise.resolve(null);
            }
            const dados = {
              saldo: e.saldo ?? 0,
              reserva: e.reserva,
              custo: e.custo,
              ultimoPreco: e.ult_preco,
              ultimaCompra: data(e.ult_compra),
            };
            estoqueGravado++;
            return tx.estoque.upsert({
              where: { empresaId_produtoId_armazemId: { empresaId, produtoId, armazemId } },
              create: { ...dados, empresaId, produtoId, armazemId },
              update: dados,
            });
          }),
        );
      }
      console.log(
        `Estoque: ${estoqueGravado} gravados (upsert)` +
          (estoqueSemRef ? `; ${estoqueSemRef} ignorados sem produto/armazém correspondente` : ''),
      );

      // --- Notas: createMany + skipDuplicates por (empresaId, codigoLegado) ---
      const notasData: Prisma.NotaSaidaCreateManyInput[] = notasLegado.map((n) => ({
        empresaId,
        codigoLegado: n.id,
        clienteId: n.cliente_id != null ? (clienteMapa.get(n.cliente_id) ?? null) : null,
        vendedorId: n.vendedor1_id != null ? (vendedorMapa.get(n.vendedor1_id) ?? null) : null,
        condicaoPagamentoId:
          n.condicao_id != null ? (condicaoMapa.get(n.condicao_id) ?? null) : null,
        numero: texto(n.nota_fiscal) ?? String(n.id),
        serie: texto(n.serie_fiscal),
        especieFiscal: texto(n.especie_fiscal),
        tipo: texto(n.tipo),
        dtEmissao: data(n.dt_emissao),
        ano: inteiro(n.ano),
        mes: inteiro(n.mes),
        vlrBruto: n.vlr_bruto ?? 0,
        vlrMercadoria: n.vlr_mercadoria ?? 0,
        vlrItens: n.vlr_itens ?? 0,
        vlrDesconto: n.vlr_desconto ?? 0,
        vlrIcms: n.vlr_icms ?? 0,
        vlrIpi: n.vlr_ipi ?? 0,
        vlrFrete: n.vlr_frete ?? 0,
        vlrDevolucao: n.vlr_devolucao ?? 0,
        chaveNfe: texto(n.chave_nfe),
        dtNfe: data(n.dt_nfe),
        mensagem: texto(n.mensagem_nf),
        comodato: n.comodato === 'S',
        ativo: n.reg_ativo !== 'N',
      }));
      let notasGravadas = 0;
      for (let i = 0; i < notasData.length; i += LOTE) {
        const res = await tx.notaSaida.createMany({
          data: notasData.slice(i, i + LOTE),
          skipDuplicates: true,
        });
        notasGravadas += res.count;
      }
      console.log(`Notas de saída: ${notasGravadas} inseridas (${notasLegado.length} no legado).`);

      // Mapa id legado da nota → id novo (para o FK dos itens).
      const notasNovas = await tx.notaSaida.findMany({
        where: { empresaId, codigoLegado: { not: null } },
        select: { id: true, codigoLegado: true },
      });
      const notaMapa = new Map(notasNovas.map((n) => [n.codigoLegado as number, n.id]));

      // --- Itens: createMany + skipDuplicates ---
      let itensSemNota = 0;
      const itensData: Prisma.NotaSaidaItemCreateManyInput[] = [];
      for (const it of itensLegado) {
        const notaSaidaId = notaMapa.get(it.nota_saida_id);
        if (!notaSaidaId) {
          itensSemNota++;
          continue;
        }
        itensData.push({
          empresaId,
          codigoLegado: it.id,
          notaSaidaId,
          clienteId: it.cliente_id != null ? (clienteMapa.get(it.cliente_id) ?? null) : null,
          vendedorId: it.vendedor1_id != null ? (vendedorMapa.get(it.vendedor1_id) ?? null) : null,
          produtoId: it.produto_id != null ? (produtoMapa.get(it.produto_id) ?? null) : null,
          item: inteiro(it.item),
          dtEmissao: data(it.dt_emissao),
          ano: inteiro(it.ano),
          mes: inteiro(it.mes),
          cfop: texto(it.cfop),
          tipo: texto(it.tipo),
          quantidade: it.qtd ?? 0,
          vlrUnitario: it.vlr_unitario ?? 0,
          vlrTabela: it.vlr_tabela,
          percDesconto: it.perc_desconto,
          vlrDesconto: it.vlr_desconto ?? 0,
          vlrTotal: it.vlr_total ?? 0,
          quantidadeDev: it.qtd_dev,
          vlrDev: it.vlr_dev,
          peso: it.peso,
          comodato: it.comodato === 'S',
          ativo: it.reg_ativo !== 'N',
        });
      }
      let itensGravados = 0;
      for (let i = 0; i < itensData.length; i += LOTE) {
        const res = await tx.notaSaidaItem.createMany({
          data: itensData.slice(i, i + LOTE),
          skipDuplicates: true,
        });
        itensGravados += res.count;
      }
      console.log(
        `Itens de nota: ${itensGravados} inseridos (${itensLegado.length} no legado)` +
          (itensSemNota ? `; ${itensSemNota} ignorados sem nota correspondente` : ''),
      );

      // --- Títulos: createMany + skipDuplicates ---
      const titulosData: Prisma.TituloReceberCreateManyInput[] = titulosLegado.map((t) => ({
        empresaId,
        codigoLegado: t.id,
        clienteId: t.cliente_id != null ? (clienteMapa.get(t.cliente_id) ?? null) : null,
        vendedorId: t.vendedor_id != null ? (vendedorMapa.get(t.vendedor_id) ?? null) : null,
        numero: texto(t.numero) ?? String(t.id),
        parcela: texto(t.parcela),
        prefixo: texto(t.prefixo),
        tipo: texto(t.tipo),
        emissao: data(t.emissao),
        vencimento: data(t.vencimento),
        vencimentoReal: data(t.venc_real),
        valor: t.valor ?? 0,
        saldo: t.saldo ?? 0,
        acrescimo: t.acrescimo,
        decrescimo: t.decrescimo,
        dtBaixa: data(t.baixa),
        formaPgto: texto(t.forma_pgto),
        historico: texto(t.historico),
        ativo: t.reg_ativo !== 'N',
      }));
      let titulosGravados = 0;
      for (let i = 0; i < titulosData.length; i += LOTE) {
        const res = await tx.tituloReceber.createMany({
          data: titulosData.slice(i, i + LOTE),
          skipDuplicates: true,
        });
        titulosGravados += res.count;
      }
      console.log(
        `Títulos a receber: ${titulosGravados} inseridos (${titulosLegado.length} no legado).`,
      );
    },
    { timeout: 600_000 },
  );

  console.log('Import do movimento comercial concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
