/**
 * Importa do sistema legado (MySQL rcgdistc_portal) o catálogo de produtos e
 * o cadastro de vendedores/supervisores para a empresa RCG.
 *
 * Pré-requisitos:
 * - Seed já rodado (empresa RCG existente).
 * - Arquivo prisma/seed-data/import-legado/produtos.jsonl e/ou
 *   vendedores.jsonl (um JSON por linha), gerados a partir do MySQL com
 *   JSON_OBJECT sobre as tabelas produto/vendedor (mysql -N -B -r).
 *
 * Idempotência: cada import só roda se a tabela de destino estiver vazia
 * para a empresa (checagem independente por tabela).
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

async function importProdutos() {
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

interface LegadoVendedor {
  id: number;
  codErp: string;
  nome: string;
  nomeReduzido: string | null;
  ddd: string | null;
  telefone: string | null;
  celular: string | null;
  email: string | null;
  status: string | null;
  desligado: string | null;
  vendedor: string | null;
  supervisor: string | null;
  supervisorId: number | null;
  dtNascimento: string | null;
}

/**
 * Importa vendedor/supervisor/gerente do legado (tabela `vendedor` do MySQL,
 * exportada previamente para vendedores.jsonl via JSON_OBJECT — ver
 * AGENTS.md ou o histórico do chat para o comando exato).
 *
 * Diferente de importProdutos: busca a empresa por `alias` ('rcg'), não por
 * CNPJ — o CNPJ_RCG usado no import de produtos não bate com o que o
 * seed-base.ts atual semeia (bug pré-existente, fora de escopo aqui).
 *
 * Duas passadas: 1ª cria todos os vendedores (sem hierarquia, pra ter os
 * ids novos); 2ª resolve supervisorId a partir do id do legado, usando o
 * mapa id-legado→id-novo montado na 1ª passada. `gerente`/`gerenteId`
 * ficam de fora — o legado não tem esse conceito; hierarquia de gerente é
 * cadastrada manualmente depois pela tela.
 */
async function importVendedores() {
  const empresa = await prisma.empresa.findUnique({ where: { alias: 'rcg' } });
  if (!empresa) throw new Error('Empresa RCG (alias "rcg") não encontrada — rode o seed antes.');
  const empresaId = empresa.id;

  // "vendedores" tem RLS (ver AGENTS.md): qualquer leitura/escrita precisa
  // rodar dentro de uma transação com app.current_empresa_id setado, senão
  // a policy zera o SELECT (idempotência sempre veria 0) e rejeita o
  // INSERT. Aqui replicamos manualmente o que PrismaService.withTenant faz
  // — este script roda com PrismaClient puro, fora do Nest.
  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${empresaId}, true)`;

      const jaTemVendedores = await tx.vendedor.count({ where: { empresaId } });
      if (jaTemVendedores > 0) {
        console.log(`Vendedores já importados (${jaTemVendedores}) — pulando.`);
        return;
      }

      const legadoIdParaNovoId = new Map<number, string>();
      const linhas: LegadoVendedor[] = [];

      await streamJsonl<LegadoVendedor>('vendedores.jsonl', async (v) => {
        linhas.push(v);
        const telefone = v.ddd && v.telefone ? `(${v.ddd}) ${v.telefone}` : v.telefone;
        const criado = await tx.vendedor.create({
          data: {
            empresaId,
            codigoErp: v.codErp,
            nome: v.nome,
            nomeReduzido: v.nomeReduzido,
            // celular do legado é sempre null (campo unificado com telefone
            // no cadastro novo) — não é gravado.
            telefone,
            email: v.email,
            dataNascimento: v.dtNascimento ? new Date(v.dtNascimento) : null,
            vendedor: v.vendedor === 'S',
            supervisor: v.supervisor === 'S',
            gerente: false,
            ativo: v.status === 'A',
            desligado: v.desligado === 'S',
          },
        });
        legadoIdParaNovoId.set(v.id, criado.id);
      });

      let hierarquiaResolvida = 0;
      for (const v of linhas) {
        if (v.supervisorId == null) continue;
        const supervisorNovoId = legadoIdParaNovoId.get(v.supervisorId);
        const vendedorNovoId = legadoIdParaNovoId.get(v.id);
        if (!supervisorNovoId || !vendedorNovoId) continue;
        await tx.vendedor.update({
          where: { id: vendedorNovoId },
          data: { supervisorId: supervisorNovoId },
        });
        hierarquiaResolvida++;
      }

      console.log(
        `Vendedores importados: ${linhas.length} (hierarquia resolvida em ${hierarquiaResolvida} registros).`,
      );
    },
    { timeout: 30_000 },
  );
}

async function main() {
  // Cada import é independente — um falhar (ex.: bug conhecido do CNPJ_RCG
  // em importProdutos, ver comentário na função) não deve impedir o outro.
  try {
    await importProdutos();
  } catch (e) {
    console.error('Falha em importProdutos (pulando):', e);
  }
  await importVendedores();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
