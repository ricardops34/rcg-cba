/**
 * Importa do sistema legado (MySQL rcgdistc_portal) o catálogo de produtos
 * para a empresa RCG.
 *
 * Pré-requisitos:
 * - Seed já rodado (empresa RCG existente).
 * - Arquivo prisma/seed-data/import-legado/produtos.jsonl (um JSON por linha),
 *   gerado a partir do MySQL com JSON_OBJECT sobre a tabela produto
 *   (mysql -N -B -r + saneamento de encoding).
 *
 * Idempotência: só roda se a tabela produtos estiver vazia para a empresa.
 *
 * O host tem pouca RAM: o arquivo é processado em streaming, gravando em
 * lotes, sem carregar tudo em memória. Rodar de preferência em um container
 * dedicado (sem o NestJS junto):
 *   docker run --rm -m 700m -v /root/rcgcba:/app -w /app/apps/api \
 *     --network network_public rcgcba-api-dev:latest npx ts-node prisma/import-legado.ts
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

const prisma = new PrismaClient();
const DIR = path.join(__dirname, 'seed-data', 'import-legado');
const CNPJ_RCG = '00000000000191';
const LOTE = 1000;

/** Processa um .jsonl linha a linha, sem carregar o arquivo inteiro. */
async function streamJsonl<T>(arquivo: string, cb: (row: T) => Promise<void> | void) {
  const caminho = path.join(DIR, arquivo);
  if (!fs.existsSync(caminho)) throw new Error(`Arquivo não encontrado: ${caminho}`);
  const rl = readline.createInterface({
    input: fs.createReadStream(caminho, 'utf8'),
    crlfDelay: Infinity,
  });
  for await (const linha of rl) {
    const l = linha.trim();
    if (l) await cb(JSON.parse(l) as T);
  }
}

/** Acumula linhas e grava em lotes via createMany. */
function loteador<T>(gravar: (rows: T[]) => Promise<unknown>) {
  let buffer: T[] = [];
  let total = 0;
  return {
    async push(row: T) {
      buffer.push(row);
      if (buffer.length >= LOTE) {
        await gravar(buffer);
        total += buffer.length;
        buffer = [];
      }
    },
    async flush() {
      if (buffer.length) {
        await gravar(buffer);
        total += buffer.length;
        buffer = [];
      }
      return total;
    },
  };
}

interface LegadoProduto {
  id: number;
  codErp: string;
  descricao: string;
  unidade: string | null;
  categoria: string | null;
  subCategoria: string | null;
  marca: string | null;
  codigoBarras: string | null;
  ncm: string | null;
  qtdEmbalagem: number | null;
  peso: number | null;
  ultimoPreco: number | null;
  observacao: string | null;
  status: string | null;
}

async function main() {
  const empresa = await prisma.empresa.findUnique({ where: { cnpj: CNPJ_RCG } });
  if (!empresa) throw new Error('Empresa RCG não encontrada — rode o seed antes.');
  const empresaId = empresa.id;

  const jaTemProdutos = await prisma.produto.count({ where: { empresaId } });
  if (jaTemProdutos === 0) {
    const lote = loteador<Prisma.ProdutoCreateManyInput>((rows) =>
      prisma.produto.createMany({ data: rows, skipDuplicates: true }),
    );
    await streamJsonl<LegadoProduto>('produtos.jsonl', async (p) => {
      await lote.push({
        empresaId,
        codigoErp: p.codErp,
        descricao: p.descricao,
        unidade: p.unidade,
        categoria: p.categoria,
        subCategoria: p.subCategoria,
        marca: p.marca,
        codigoBarras: p.codigoBarras,
        ncm: p.ncm,
        qtdEmbalagem: p.qtdEmbalagem,
        peso: p.peso,
        ultimoPreco: p.ultimoPreco,
        observacao: p.observacao,
        ativo: p.status !== 'B',
      });
    });
    console.log(`Produtos importados: ${await lote.flush()}`);
  } else {
    console.log(`Produtos já importados (${jaTemProdutos}) — pulando.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
