/**
 * Importa do sistema legado (MySQL rcgdistc_portal) os dados de vendas para a
 * empresa RCG: produtos, notas fiscais de saída (com itens) e títulos a receber.
 *
 * Pré-requisitos:
 * - Seed já rodado (empresa RCG, colaboradores e clientes reais importados).
 * - Arquivos JSONL em prisma/seed-data/import-legado/ (um JSON por linha),
 *   gerados a partir do MySQL com JSON_OBJECT sobre produto, titulo_receber,
 *   nota_saida e nota_saida_item (mysql -N -B -r + saneamento de encoding).
 *
 * Idempotência: cada seção só roda se a tabela correspondente estiver vazia
 * para a empresa (mesma estratégia do import de clientes no seed).
 *
 * O host tem pouca RAM: os arquivos grandes são processados em streaming,
 * gravando em lotes, sem carregar tudo em memória. Rodar de preferência em um
 * container dedicado (sem o NestJS junto):
 *   docker run --rm -m 700m -v /root/rcgcba:/app -w /app/apps/api \
 *     --network network_public rcgcba-api-dev:latest npx ts-node prisma/import-legado.ts
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
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

interface LegadoTitulo {
  id: number;
  clienteId: number | null;
  vendedorId: number | null;
  numero: string;
  parcela: string | null;
  prefixo: string | null;
  tipo: string | null;
  emissao: string;
  vencimento: string;
  valor: number | null;
  saldo: number | null;
  baixa: string | null;
}

interface LegadoNota {
  id: number;
  clienteId: number | null;
  vendedorId: number | null;
  numero: string;
  serie: string | null;
  especieFiscal: string | null;
  dtEmissao: string;
  vlrMercadoria: number | null;
  vlrDesconto: number | null;
  vlrIcms: number | null;
  vlrIpi: number | null;
  vlrFrete: number | null;
  vlrItens: number | null;
  chaveNfe: string | null;
  comodato: string | null;
}

interface LegadoItem {
  notaId: number;
  item: string | null;
  produtoId: number | null;
  qtd: number | null;
  vlrUnitario: number | null;
  vlrDesconto: number | null;
  vlrTotal: number | null;
}

interface LegadoPessoa {
  id: number;
  codErp: string | null;
}

interface LegacyJson {
  vendedores: LegadoPessoa[];
  supervisores: LegadoPessoa[];
  clientes: LegadoPessoa[];
}

async function main() {
  const empresa = await prisma.empresa.findUnique({ where: { cnpj: CNPJ_RCG } });
  if (!empresa) throw new Error('Empresa RCG não encontrada — rode o seed antes.');
  const empresaId = empresa.id;

  // Mapas legado → novo. O elo entre os dois mundos é sempre o cod_erp:
  // o id numérico do MySQL não existe no Postgres.
  const legacy = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'seed-data', 'legacy.json'), 'utf8'),
  ) as LegacyJson;

  const clientesDb = await prisma.cliente.findMany({
    where: { empresaId },
    select: { id: true, codigoErp: true },
  });
  const clientePorCodErp = new Map(clientesDb.map((c) => [c.codigoErp, c.id]));
  const clientePorLegado = new Map<number, string>();
  for (const c of legacy.clientes) {
    const novo = c.codErp && clientePorCodErp.get(c.codErp);
    if (novo) clientePorLegado.set(c.id, novo);
  }

  const colabsDb = await prisma.colaborador.findMany({
    where: { empresaId },
    select: { id: true, codigoErp: true },
  });
  const colabPorCodErp = new Map(colabsDb.map((c) => [c.codigoErp, c.id]));
  // Nas notas/títulos a referência de vendedor é sempre à tabela `vendedor`.
  const colabPorLegadoVendedor = new Map<number, string>();
  for (const v of legacy.vendedores) {
    const novo = v.codErp && colabPorCodErp.get(v.codErp);
    if (novo) colabPorLegadoVendedor.set(v.id, novo);
  }

  // ------------------------------------------------------------------
  // Produtos
  // ------------------------------------------------------------------
  const produtoPorLegado = new Map<number, string>();
  const produtoDescricao = new Map<number, string>();

  const jaTemProdutos = await prisma.produto.count({ where: { empresaId } });
  if (jaTemProdutos === 0) {
    const lote = loteador<Prisma.ProdutoCreateManyInput>((rows) =>
      prisma.produto.createMany({ data: rows, skipDuplicates: true }),
    );
    await streamJsonl<LegadoProduto>('produtos.jsonl', async (p) => {
      const id = randomUUID();
      produtoPorLegado.set(p.id, id);
      produtoDescricao.set(p.id, p.descricao);
      await lote.push({
        id,
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
    // Já importado antes: reconstrói o mapa a partir do banco.
    const db = await prisma.produto.findMany({
      where: { empresaId },
      select: { id: true, codigoErp: true, descricao: true },
    });
    const porCod = new Map(db.map((p) => [p.codigoErp, p]));
    await streamJsonl<LegadoProduto>('produtos.jsonl', (p) => {
      const existente = porCod.get(p.codErp);
      if (existente) {
        produtoPorLegado.set(p.id, existente.id);
        produtoDescricao.set(p.id, existente.descricao);
      }
    });
    console.log(`Produtos já importados (${jaTemProdutos}) — pulando.`);
  }

  // ------------------------------------------------------------------
  // Notas de saída + itens
  // ------------------------------------------------------------------
  const jaTemNotas = await prisma.notaSaida.count({ where: { empresaId } });
  if (jaTemNotas === 0) {
    const notaPorLegado = new Map<number, string>();
    const chavesUsadas = new Set<string>();
    const loteNotas = loteador<Prisma.NotaSaidaCreateManyInput>((rows) =>
      prisma.notaSaida.createMany({ data: rows, skipDuplicates: true }),
    );
    await streamJsonl<LegadoNota>('notas.jsonl', async (n) => {
      const chave = `${n.numero}|${n.serie ?? ''}`;
      if (chavesUsadas.has(chave)) return; // proteção contra colisão do unique
      chavesUsadas.add(chave);
      const id = randomUUID();
      notaPorLegado.set(n.id, id);
      const dt = new Date(n.dtEmissao);
      await loteNotas.push({
        id,
        empresaId,
        clienteId: (n.clienteId && clientePorLegado.get(n.clienteId)) || null,
        colaboradorId: (n.vendedorId && colabPorLegadoVendedor.get(n.vendedorId)) || null,
        numero: n.numero,
        serie: n.serie,
        especieFiscal: n.especieFiscal,
        dtEmissao: dt,
        ano: dt.getFullYear(),
        mes: dt.getMonth() + 1,
        vlrMercadoria: n.vlrMercadoria ?? 0,
        vlrDesconto: n.vlrDesconto ?? 0,
        vlrIcms: n.vlrIcms ?? 0,
        vlrIpi: n.vlrIpi ?? 0,
        vlrFrete: n.vlrFrete ?? 0,
        vlrItens: n.vlrItens ?? 0,
        chaveNfe: n.chaveNfe,
        comodato: n.comodato === 'S',
        ativo: true,
      });
    });
    console.log(`Notas de saída importadas: ${await loteNotas.flush()}`);

    const loteItens = loteador<Prisma.NotaSaidaItemCreateManyInput>((rows) =>
      prisma.notaSaidaItem.createMany({ data: rows }),
    );
    await streamJsonl<LegadoItem>('itens.jsonl', async (it) => {
      const notaSaidaId = notaPorLegado.get(it.notaId);
      if (!notaSaidaId) return;
      const qtd = it.qtd ?? 1;
      const unit = it.vlrUnitario ?? 0;
      const desc = it.vlrDesconto ?? 0;
      await loteItens.push({
        notaSaidaId,
        produtoId: (it.produtoId && produtoPorLegado.get(it.produtoId)) || null,
        item: Number.parseInt(it.item ?? '0', 10) || 0,
        descricao:
          (it.produtoId && produtoDescricao.get(it.produtoId)) || `ITEM ${it.item ?? ''}`.trim(),
        quantidade: qtd,
        vlrUnitario: unit,
        vlrDesconto: desc,
        vlrTotal: it.vlrTotal ?? qtd * unit - desc,
      });
    });
    console.log(`Itens de nota importados: ${await loteItens.flush()}`);
  } else {
    console.log(`Notas já importadas (${jaTemNotas}) — pulando.`);
  }

  // ------------------------------------------------------------------
  // Títulos a receber
  // ------------------------------------------------------------------
  const jaTemTitulos = await prisma.tituloReceber.count({ where: { empresaId } });
  if (jaTemTitulos === 0) {
    const lote = loteador<Prisma.TituloReceberCreateManyInput>((rows) =>
      prisma.tituloReceber.createMany({ data: rows }),
    );
    await streamJsonl<LegadoTitulo>('titulos.jsonl', async (t) => {
      await lote.push({
        empresaId,
        clienteId: (t.clienteId && clientePorLegado.get(t.clienteId)) || null,
        colaboradorId: (t.vendedorId && colabPorLegadoVendedor.get(t.vendedorId)) || null,
        numero: t.numero,
        parcela: t.parcela,
        prefixo: t.prefixo,
        tipo: t.tipo,
        emissao: new Date(t.emissao),
        vencimento: new Date(t.vencimento),
        valor: t.valor ?? 0,
        saldo: t.saldo ?? 0,
        dtBaixa: t.baixa ? new Date(t.baixa) : null,
        ativo: true,
      });
    });
    console.log(`Títulos a receber importados: ${await lote.flush()}`);
  } else {
    console.log(`Títulos já importados (${jaTemTitulos}) — pulando.`);
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
