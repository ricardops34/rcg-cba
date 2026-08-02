/**
 * Importa as tabelas de preço do sistema legado (MySQL rcgdistc_portal):
 * `tabela_preco` (cabeçalho, ~55 linhas) e `tabela_preco_item` (produto +
 * preço, ~16.700 linhas) — conectando direto via mysql2 em runtime, como os
 * demais imports.
 *
 * Carga usa createMany em lotes com skipDuplicates: tabelas por
 * (empresaId, codigoErp) — cod_erp é único no legado —, itens por
 * (empresaId, codigoLegado) — o id da linha no MySQL, já que não há chave
 * natural no item. Idempotente: reexecutar não duplica.
 *
 * Pré-requisitos (nesta ordem): seed → import-legado (produtos).
 *
 * Rodar (a partir da raiz do repo):
 *   pnpm --filter @plataforma/api exec ts-node prisma/import-tabela-preco.ts
 * Dentro do container api (MySQL na rede do compose):
 *   MYSQL_HOST=mysql MYSQL_PORT=3306 pnpm --filter @plataforma/api exec ts-node prisma/import-tabela-preco.ts
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

interface LegadoTabelaPreco {
  id: number;
  cod_erp: string | null;
  descricao: string | null;
  status: string | null;
  dt_inicio: string | null;
  dt_fim: string | null;
}

interface LegadoTabelaPrecoItem {
  id: number;
  tabela_preco_id: number;
  produto_id: number;
  preco: number | null;
  status: string | null;
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
  const [tabelasRows] = await conexao.query('SELECT * FROM tabela_preco');
  const [itensRows] = await conexao.query('SELECT * FROM tabela_preco_item');
  const [produtosRefRows] = await conexao.query(
    'SELECT id, cod_erp FROM produto',
  );
  await conexao.end();

  const tabelasLegado = tabelasRows as LegadoTabelaPreco[];
  const itensLegado = itensRows as LegadoTabelaPrecoItem[];
  console.log(
    `Legado: ${tabelasLegado.length} tabelas de preço, ${itensLegado.length} itens.`,
  );

  const empresa = await prisma.empresa.findUnique({
    where: { alias: ALIAS_EMPRESA },
  });
  if (!empresa) {
    throw new Error(
      `Empresa com alias "${ALIAS_EMPRESA}" não encontrada — rode o seed antes.`,
    );
  }
  const empresaId = empresa.id;

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${empresaId}, true)`;

      const produtosNovos = await tx.produto.findMany({
        where: { empresaId },
        select: { id: true, codigoErp: true },
      });
      const porCodErp = (rows: { id: string; codigoErp: string | null }[]) =>
        new Map(
          rows
            .filter((r) => r.codigoErp)
            .map((r) => [r.codigoErp as string, r.id]),
        );
      const produtoMapa = montarMapa(
        produtosRefRows as RefRow[],
        porCodErp(produtosNovos),
      );

      // --- Tabelas: createMany + skipDuplicates por (empresaId, codigoErp) ---
      const tabelasData: Prisma.TabelaPrecoCreateManyInput[] = tabelasLegado
        .filter((t) => texto(t.cod_erp))
        .map((t) => ({
          empresaId,
          codigoErp: texto(t.cod_erp) as string,
          descricao: texto(t.descricao) ?? (texto(t.cod_erp) as string),
          dtInicio: data(t.dt_inicio),
          dtFim: data(t.dt_fim),
          ativo: t.status !== 'N',
        }));
      let tabelasGravadas = 0;
      for (let i = 0; i < tabelasData.length; i += LOTE) {
        const res = await tx.tabelaPreco.createMany({
          data: tabelasData.slice(i, i + LOTE),
          skipDuplicates: true,
        });
        tabelasGravadas += res.count;
      }
      console.log(
        `Tabelas de preço: ${tabelasGravadas} inseridas (${tabelasLegado.length} no legado).`,
      );

      // Mapa id legado da tabela → id novo (para o FK dos itens; a tabela nova
      // não guarda o id legado, só o codigoErp).
      const tabelasNovas = await tx.tabelaPreco.findMany({
        where: { empresaId },
        select: { id: true, codigoErp: true },
      });
      const tabelaPrecoMapa = montarMapa(
        tabelasLegado.map((t) => ({ id: t.id, cod_erp: t.cod_erp })),
        porCodErp(tabelasNovas),
      );

      // --- Itens: createMany + skipDuplicates por (empresaId, codigoLegado) ---
      let itensSemTabela = 0;
      let itensSemProduto = 0;
      const itensData: Prisma.TabelaPrecoItemCreateManyInput[] = [];
      for (const it of itensLegado) {
        const tabelaPrecoId = tabelaPrecoMapa.get(it.tabela_preco_id);
        if (!tabelaPrecoId) {
          itensSemTabela++;
          continue;
        }
        const produtoId = produtoMapa.get(it.produto_id);
        if (!produtoId) {
          itensSemProduto++;
          continue;
        }
        itensData.push({
          empresaId,
          tabelaPrecoId,
          produtoId,
          codigoLegado: it.id,
          preco: it.preco ?? 0,
          ativo: it.status !== 'N',
        });
      }
      let itensGravados = 0;
      for (let i = 0; i < itensData.length; i += LOTE) {
        const res = await tx.tabelaPrecoItem.createMany({
          data: itensData.slice(i, i + LOTE),
          skipDuplicates: true,
        });
        itensGravados += res.count;
      }
      console.log(
        `Itens de tabela de preço: ${itensGravados} inseridos (${itensLegado.length} no legado)` +
          (itensSemTabela
            ? `; ${itensSemTabela} ignorados sem tabela correspondente`
            : '') +
          (itensSemProduto
            ? `; ${itensSemProduto} ignorados sem produto correspondente`
            : ''),
      );
    },
    { timeout: 10 * 60 * 1000 },
  );

  console.log('\nImportação de tabelas de preço concluída.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
