/**
 * Importa as metas de vendedor do sistema legado (MySQL rcgdistc_portal) —
 * `meta_vendedor_mes` (meta mensal) e `meta_vendedor_categoria` (meta por
 * categoria dentro do mês) — para ObjetivoVendedorMes/ObjetivoVendedorCategoria.
 * Mesmo padrão dos demais imports: conecta direto via mysql2 em runtime,
 * casa por cod_erp, createMany em lotes com skipDuplicates por
 * (empresaId, codigoLegado) — idempotente.
 *
 * O legado usa `dt_delete` como soft-delete próprio dessas duas tabelas
 * (diferente do reg_ativo usado em nota_saida/titulo_receber) — só linhas
 * com dt_delete NULL são importadas.
 *
 * Pré-requisitos (nesta ordem): seed → import-auxiliares (categorias) →
 * import-legado (vendedores) → este script.
 *
 * Rodar (a partir da raiz do repo):
 *   pnpm --filter @plataforma/api exec ts-node prisma/import-objetivos.ts
 * Dentro do container api (MySQL na rede do compose):
 *   MYSQL_HOST=mysql MYSQL_PORT=3306 pnpm --filter @plataforma/api exec ts-node prisma/import-objetivos.ts
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

const inteiro = (v: string | null | undefined): number | null => {
  const n = Number(texto(v));
  return Number.isInteger(n) ? n : null;
};

interface LegadoMetaMes {
  id: number;
  vendedor_id: number;
  mes: string;
  ano: string;
  valor: number | null;
  numero_cliente: number | null;
  tipo: string | null;
  novo_cliente: number | null;
}

interface LegadoMetaCategoria {
  id: number;
  meta_vendedor_mes_id: number;
  categoria_id: number;
  valor: number | null;
}

interface RefRow {
  id: number;
  cod_erp: string | null;
}

/** id legado → id novo, casando por cod_erp (chave estável entre os sistemas). */
function montarMapa(legado: RefRow[], novosPorCodErp: Map<string, string>): Map<number, string> {
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
  const [metasMesRows] = await conexao.query('SELECT * FROM meta_vendedor_mes WHERE dt_delete IS NULL');
  const [metasCategoriaRows] = await conexao.query(
    'SELECT * FROM meta_vendedor_categoria WHERE dt_delete IS NULL',
  );
  const [vendedoresRefRows] = await conexao.query('SELECT id, cod_erp FROM vendedor');
  const [categoriasRefRows] = await conexao.query('SELECT id, cod_erp FROM categoria');
  await conexao.end();

  const metasMesLegado = metasMesRows as LegadoMetaMes[];
  const metasCategoriaLegado = metasCategoriaRows as LegadoMetaCategoria[];
  console.log(
    `Legado: ${metasMesLegado.length} metas mensais, ${metasCategoriaLegado.length} metas por categoria.`,
  );

  const empresa = await prisma.empresa.findUnique({ where: { alias: ALIAS_EMPRESA } });
  if (!empresa) {
    throw new Error(`Empresa com alias "${ALIAS_EMPRESA}" não encontrada — rode o seed antes.`);
  }
  const empresaId = empresa.id;

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${empresaId}, true)`;

      const [vendedoresNovos, categoriasNovas] = await Promise.all([
        tx.vendedor.findMany({ where: { empresaId }, select: { id: true, codigoErp: true } }),
        tx.categoria.findMany({ where: { empresaId }, select: { id: true, codigoErp: true } }),
      ]);
      const porCodErp = (rows: { id: string; codigoErp: string | null }[]) =>
        new Map(rows.filter((r) => r.codigoErp).map((r) => [r.codigoErp as string, r.id]));

      const vendedorMapa = montarMapa(vendedoresRefRows as RefRow[], porCodErp(vendedoresNovos));
      const categoriaMapa = montarMapa(categoriasRefRows as RefRow[], porCodErp(categoriasNovas));

      // --- Metas mensais: createMany + skipDuplicates por (empresaId, codigoLegado) ---
      let metasSemVendedor = 0;
      const metasMesData: Prisma.ObjetivoVendedorMesCreateManyInput[] = [];
      for (const m of metasMesLegado) {
        const vendedorId = vendedorMapa.get(m.vendedor_id);
        if (!vendedorId) {
          metasSemVendedor++;
          continue;
        }
        metasMesData.push({
          empresaId,
          codigoLegado: m.id,
          vendedorId,
          mes: inteiro(m.mes) ?? 0,
          ano: inteiro(m.ano) ?? 0,
          valor: m.valor ?? 0,
          numeroCliente: m.numero_cliente,
          novoCliente: m.novo_cliente,
          tipo: texto(m.tipo),
        });
      }
      let metasMesGravadas = 0;
      for (let i = 0; i < metasMesData.length; i += LOTE) {
        const res = await tx.objetivoVendedorMes.createMany({
          data: metasMesData.slice(i, i + LOTE),
          skipDuplicates: true,
        });
        metasMesGravadas += res.count;
      }
      console.log(
        `Metas mensais: ${metasMesGravadas} inseridas (${metasMesLegado.length} no legado)` +
          (metasSemVendedor ? `; ${metasSemVendedor} ignoradas sem vendedor correspondente` : ''),
      );

      // Mapa id legado da meta mensal → id novo (para o FK das linhas por categoria).
      const metasMesNovas = await tx.objetivoVendedorMes.findMany({
        where: { empresaId, codigoLegado: { not: null } },
        select: { id: true, codigoLegado: true },
      });
      const metaMesMapa = new Map(metasMesNovas.map((m) => [m.codigoLegado as number, m.id]));

      // --- Metas por categoria: createMany + skipDuplicates ---
      let categoriasSemRef = 0;
      const metasCategoriaData: Prisma.ObjetivoVendedorCategoriaCreateManyInput[] = [];
      for (const c of metasCategoriaLegado) {
        const objetivoVendedorMesId = metaMesMapa.get(c.meta_vendedor_mes_id);
        const categoriaId = categoriaMapa.get(c.categoria_id);
        if (!objetivoVendedorMesId || !categoriaId) {
          categoriasSemRef++;
          continue;
        }
        metasCategoriaData.push({
          empresaId,
          codigoLegado: c.id,
          objetivoVendedorMesId,
          categoriaId,
          valor: c.valor ?? 0,
        });
      }
      let metasCategoriaGravadas = 0;
      for (let i = 0; i < metasCategoriaData.length; i += LOTE) {
        const res = await tx.objetivoVendedorCategoria.createMany({
          data: metasCategoriaData.slice(i, i + LOTE),
          skipDuplicates: true,
        });
        metasCategoriaGravadas += res.count;
      }
      console.log(
        `Metas por categoria: ${metasCategoriaGravadas} inseridas (${metasCategoriaLegado.length} no legado)` +
          (categoriasSemRef ? `; ${categoriasSemRef} ignoradas sem meta mensal/categoria correspondente` : ''),
      );
    },
    { timeout: 600_000 },
  );

  console.log('Import de objetivos concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
