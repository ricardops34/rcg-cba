/**
 * Importa do sistema legado (MySQL rcgdistc_portal) o catálogo de produtos e
 * o cadastro de vendedores/supervisores para a empresa RCG, conectando direto
 * via mysql2 em runtime — mesmo padrão de import-clientes.ts e
 * import-auxiliares.ts. Nenhum arquivo de dados intermediário é usado (o
 * mecanismo antigo de .jsonl foi aposentado: dado real não pode ficar no
 * repositório).
 *
 * Idempotente: upsert por (empresaId, codigoErp), pode rodar quantas vezes
 * for preciso. No update de vendedor, gerente/gerenteId/usuarioId são
 * preservados — são vínculos mantidos manualmente pela tela, sem
 * correspondência no legado.
 *
 * Pré-requisitos: seed rodado (empresa com alias 'rcg') e MySQL do dump
 * acessível (serviço `mysql` do docker-compose.dev.yml; vars MYSQL_* no .env).
 *
 * Rodar (a partir da raiz do repo):
 *   pnpm --filter @plataforma/api exec ts-node prisma/import-legado.ts
 * Dentro do container api (MySQL na rede do compose):
 *   MYSQL_HOST=mysql MYSQL_PORT=3306 pnpm --filter @plataforma/api exec ts-node prisma/import-legado.ts
 */
import { PrismaClient } from '@prisma/client';
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
const LOTE = 200;

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

interface LegadoProduto {
  id: number;
  cod_erp: string;
  descricao: string;
  um: string | null;
  categoria_cod: string | null; // cod_erp da categoria (join) — resolve a FK no cadastro novo
  sub_categoria_cod: string | null; // idem para subcategoria
  armazem_cod: string | null; // idem para armazém
  marca: string | null;
  codigo_barras: string | null;
  ncm: string | null;
  qtd_embalagem: number | null;
  peso: number | null;
  ult_preco: number | null;
  observacao: string | null;
  status: string | null;
}

interface LegadoVendedor {
  id: number;
  cod_erp: string | null;
  nome: string;
  nome_reduzido: string | null;
  ddd: string | null;
  telefone: string | null;
  email: string | null;
  status: string | null;
  desligado: string | null;
  vendedor: string | null;
  supervisor: string | null;
  supervisor_id: number | null;
  dt_nascmento: string | null;
}

async function main() {
  console.log(
    `Conectando ao MySQL legado em ${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database}...`,
  );
  const conexao = await mysql.createConnection(MYSQL_CONFIG);
  const [produtosRows] = await conexao.query(
    `SELECT p.id, p.cod_erp, p.descricao, p.um, c.cod_erp AS categoria_cod,
            s.cod_erp AS sub_categoria_cod, a.cod_erp AS armazem_cod,
            p.marca, p.codigo_barras, p.ncm, p.qtd_embalagem, p.peso,
            p.ult_preco, p.observacao, p.status
       FROM produto p
       LEFT JOIN categoria c ON c.id = p.categoria_id
       LEFT JOIN sub_categoria s ON s.id = p.sub_categoria_id
       LEFT JOIN armazem a ON a.id = p.armazem_id`,
  );
  const [vendedoresRows] = await conexao.query('SELECT * FROM vendedor');
  await conexao.end();

  const produtos = produtosRows as LegadoProduto[];
  const vendedores = vendedoresRows as LegadoVendedor[];
  console.log(`Legado: ${produtos.length} produtos, ${vendedores.length} vendedores.`);

  const empresa = await prisma.empresa.findUnique({ where: { alias: ALIAS_EMPRESA } });
  if (!empresa) {
    throw new Error(`Empresa com alias "${ALIAS_EMPRESA}" não encontrada — rode o seed antes.`);
  }
  const empresaId = empresa.id;

  // "produtos"/"vendedores" têm RLS: leitura/escrita dentro de transação com
  // app.current_empresa_id setado (replica PrismaService.withTenant — o
  // script roda fora do Nest/DI).
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${empresaId}, true)`;

      // Categoria/subcategoria/armazém viram FK, casadas por cod_erp com os
      // cadastros auxiliares — rode import-auxiliares.ts antes deste.
      const categorias = await tx.categoria.findMany({
        where: { empresaId, deletedAt: null },
        select: { id: true, codigoErp: true },
      });
      const categoriaPorCodErp = new Map(categorias.map((c) => [c.codigoErp, c.id]));
      const armazens = await tx.armazem.findMany({
        where: { empresaId, deletedAt: null },
        select: { id: true, codigoErp: true },
      });
      const armazemPorCodErp = new Map(armazens.map((a) => [a.codigoErp, a.id]));

      let gravados = 0;
      let semCategoria = 0;
      for (let i = 0; i < produtos.length; i += LOTE) {
        const chunk = produtos.slice(i, i + LOTE);
        await Promise.all(
          chunk.map((p) => {
            const codigoErp = p.cod_erp.trim();
            const categoriaCod = texto(p.categoria_cod);
            const subCod = texto(p.sub_categoria_cod);
            const armazemCod = texto(p.armazem_cod);
            if (categoriaCod && !categoriaPorCodErp.has(categoriaCod)) semCategoria++;
            const dados = {
              descricao: p.descricao.trim(),
              unidade: texto(p.um),
              categoriaId: categoriaCod ? (categoriaPorCodErp.get(categoriaCod) ?? null) : null,
              subCategoriaId: subCod ? (categoriaPorCodErp.get(subCod) ?? null) : null,
              armazemId: armazemCod ? (armazemPorCodErp.get(armazemCod) ?? null) : null,
              marca: texto(p.marca),
              codigoBarras: texto(p.codigo_barras),
              ncm: texto(p.ncm),
              qtdEmbalagem: p.qtd_embalagem,
              peso: p.peso,
              ultimoPreco: p.ult_preco,
              observacao: texto(p.observacao),
              ativo: p.status !== 'B',
            };
            return tx.produto.upsert({
              where: { empresaId_codigoErp: { empresaId, codigoErp } },
              create: { ...dados, empresaId, codigoErp },
              update: dados,
            });
          }),
        );
        gravados += chunk.length;
      }
      console.log(
        `Produtos: ${gravados} gravados (upsert)` +
          (semCategoria
            ? `; ${semCategoria} com categoria do legado sem correspondência (rode import-auxiliares antes)`
            : ''),
      );
    },
    { timeout: 600_000 },
  );

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${empresaId}, true)`;

      // 1ª passada: upsert dos vendedores; 2ª: resolve supervisorId pelo
      // cod_erp (o id do legado muda a cada dump, o cod_erp não).
      const codErpParaNovoId = new Map<string, string>();
      for (const v of vendedores) {
        const codigoErp = texto(v.cod_erp) ?? `LEGADO-${v.id}`;
        const telefone = v.ddd && v.telefone ? `(${v.ddd}) ${v.telefone}` : texto(v.telefone);
        const desligado = v.desligado === 'S';
        const dados = {
          nome: v.nome.trim(),
          nomeReduzido: texto(v.nome_reduzido),
          telefone,
          email: texto(v.email),
          dataNascimento: data(v.dt_nascmento),
          ativo: v.status === 'A' && !desligado,
          desligado,
        };
        // O legado tem dois flags independentes; aqui o papel é um só, e
        // supervisor prevalece sobre vendedor.
        const tipo = v.supervisor === 'S' ? 'supervisor' : 'vendedor';
        const existente = await tx.vendedor.findUnique({
          where: { empresaId_codigoErp: { empresaId, codigoErp } },
          select: { tipo: true },
        });
        // `gerente` não existe no legado — é promoção feita na tela, e o
        // import não a desfaz.
        const ehGerente = existente?.tipo === 'gerente';
        const novo = await tx.vendedor.upsert({
          where: { empresaId_codigoErp: { empresaId, codigoErp } },
          // gerenteId/usuarioId/vinculo/usaDashboard ficam fora do update: não
          // existem no legado e são mantidos manualmente pela tela.
          create: { ...dados, tipo, empresaId, codigoErp },
          update: ehGerente ? dados : { ...dados, tipo },
        });
        codErpParaNovoId.set(codigoErp, novo.id);
      }

      let hierarquiaResolvida = 0;
      const legadoIdParaCodErp = new Map<number, string>();
      for (const v of vendedores) {
        legadoIdParaCodErp.set(v.id, texto(v.cod_erp) ?? `LEGADO-${v.id}`);
      }
      for (const v of vendedores) {
        const codigoErp = texto(v.cod_erp) ?? `LEGADO-${v.id}`;
        const vendedorNovoId = codErpParaNovoId.get(codigoErp);
        const supervisorCodErp =
          v.supervisor_id != null ? legadoIdParaCodErp.get(v.supervisor_id) : undefined;
        const supervisorNovoId = supervisorCodErp
          ? codErpParaNovoId.get(supervisorCodErp)
          : undefined;
        if (!vendedorNovoId) continue;
        await tx.vendedor.update({
          where: { id: vendedorNovoId },
          data: { supervisorId: supervisorNovoId ?? null },
        });
        if (supervisorNovoId) hierarquiaResolvida++;
      }
      console.log(
        `Vendedores: ${vendedores.length} gravados (upsert; hierarquia resolvida em ${hierarquiaResolvida} registros).`,
      );
    },
    { timeout: 600_000 },
  );

  console.log('Import do legado (produtos + vendedores) concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
