/**
 * Importa a carteira de clientes do sistema legado (MySQL rcgdistc_portal)
 * conectando direto via mysql2 em runtime — diferente de import-legado.ts
 * (que lê .jsonl exportado previamente): este script é idempotente e
 * reexecutável, com upsert por (empresaId, codigoErp), pensado também como
 * base da futura API externa de manutenção de Clientes.
 *
 * Pré-requisitos:
 * - Seed já rodado (empresa com alias 'rcg' existente).
 * - Import de Vendedores já rodado (import-legado.ts) — o vendedor_id do
 *   legado é resolvido casando vendedor.cod_erp (MySQL) com
 *   Vendedor.codigoErp (Postgres).
 * - Import de Tabelas de Preço já rodado (import-tabela-preco.ts) — mesmo
 *   esquema de casamento por cod_erp, pro tabela_preco_id do legado.
 * - MySQL do dump legado acessível (serviço `mysql` do
 *   docker-compose.dev.yml; vars MYSQL_* no .env, ver .env.example).
 *
 * Rodar (a partir da raiz do repo):
 *   pnpm --filter @plataforma/api exec ts-node prisma/import-clientes.ts
 * Dentro do container api (MySQL na rede do compose):
 *   MYSQL_HOST=mysql MYSQL_PORT=3306 pnpm --filter @plataforma/api exec ts-node prisma/import-clientes.ts
 */
import { PrismaClient, type Prisma, type TipoPessoa } from '@prisma/client';
import * as mysql from 'mysql2/promise';

const prisma = new PrismaClient();

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST ?? 'localhost',
  port: Number(process.env.MYSQL_PORT ?? 3307),
  user: process.env.MYSQL_USER ?? 'rcg',
  password: process.env.MYSQL_PASSWORD ?? 'rcg',
  database: process.env.MYSQL_DATABASE ?? 'rcgdistc_portal',
  // Datas como string para não sofrer deslocamento de timezone do driver e
  // para tratar '0000-00-00' (inválida em JS) sem exceção.
  dateStrings: true as const,
};

const LOTE = 200;

/**
 * filial_id (legado) → alias de Empresa (novo). No dump atual filial_id é
 * NULL em todas as linhas — a base legada é o portal da RCG, então NULL
 * mapeia para 'rcg'. Qualquer valor não mapeado derruba o script: melhor
 * falhar alto do que mis-tenantear cliente silenciosamente.
 */
const FILIAL_EMPRESA_ALIAS: Record<number, string> = {};
const ALIAS_FILIAL_NULL = 'rcg';

function filialParaAlias(filialId: number | null): string {
  if (filialId == null) return ALIAS_FILIAL_NULL;
  const alias = FILIAL_EMPRESA_ALIAS[filialId];
  if (!alias) {
    throw new Error(
      `filial_id desconhecido no legado: ${filialId} — adicione o mapeamento em FILIAL_EMPRESA_ALIAS.`,
    );
  }
  return alias;
}

interface LegadoCliente {
  id: number;
  filial_id: number | null;
  cod_erp: string | null;
  status: string | null;
  tipo: string | null;
  razao: string;
  fantasia: string | null;
  endereco: string | null;
  complemento: string | null;
  bairro: string | null;
  uf: string | null;
  municipio: string | null;
  cep: string | null;
  telefone1: string | null;
  telefone2: string | null;
  celular: string | null;
  contato: string | null;
  cnpj_cpf: string | null;
  ie: string | null;
  im: string | null;
  contribuinte: string | null;
  rg: string | null;
  nascimento: string | null;
  email: string | null;
  vendedor_id: number | null;
  tabela_preco_id: number | null;
  primeira_compra: string | null;
  ultima_visita: string | null;
  seguimento_id: number | null;
  site: string | null;
  limite: number | null;
  vencimento_limite: string | null;
  obs: string | null;
  latitude: number | null;
  longitude: number | null;
  carteira: string | null;
  obs_bloqueio: string | null;
  dt_bloqueio: string | null;
  dt_reativacao: string | null;
  obs_reativacao: string | null;
  ultima_compra: string | null;
  ultimo_atendimento: string | null;
  data_rfb: string | null;
}

interface LegadoVendedorRef {
  id: number;
  cod_erp: string | null;
}

interface LegadoTabelaPrecoRef {
  id: number;
  cod_erp: string | null;
}

/** '' e espaços viram null; demais strings são trimadas. */
const texto = (v: string | null | undefined): string | null => {
  if (v == null) return null;
  const t = v.trim();
  return t === '' ? null : t;
};

/** 'S'/'N' → boolean; qualquer outro valor (ex.: '1' sujo em carteira) → null. */
const simNao = (v: string | null | undefined): boolean | null =>
  v === 'S' ? true : v === 'N' ? false : null;

/** Datas do MySQL em string (dateStrings) → Date; zero-date/inválida → null. */
const data = (v: string | null | undefined): Date | null => {
  if (!v || v.startsWith('0000')) return null;
  const d = new Date(v.includes(' ') ? v.replace(' ', 'T') : `${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

function mapearCliente(
  c: LegadoCliente,
  vendedorId: string | null,
  tabelaPrecoId: string | null,
): Omit<Prisma.ClienteUncheckedCreateInput, 'empresaId' | 'codigoErp'> {
  return {
    ativo: c.status !== 'B',
    tipoPessoa: (c.tipo === 'F' ? 'fisica' : 'juridica') as TipoPessoa,
    razaoSocial: c.razao.trim(),
    nomeFantasia: texto(c.fantasia),
    cnpjCpf: texto(c.cnpj_cpf),
    inscricaoEstadual: texto(c.ie),
    inscricaoMunicipal: texto(c.im),
    contribuinteIcms: simNao(c.contribuinte),
    rg: texto(c.rg),
    dataNascimento: data(c.nascimento),
    contato: texto(c.contato),
    email: texto(c.email),
    telefone: texto(c.telefone1),
    telefone2: texto(c.telefone2),
    celular: texto(c.celular),
    endereco: texto(c.endereco),
    complemento: texto(c.complemento),
    bairro: texto(c.bairro),
    municipio: texto(c.municipio),
    uf: texto(c.uf),
    cep: texto(c.cep),
    latitude: c.latitude,
    longitude: c.longitude,
    vendedorId,
    tabelaPrecoId,
    carteira: simNao(c.carteira),
    site: texto(c.site),
    limiteCredito: c.limite,
    vencimentoLimite: data(c.vencimento_limite),
    observacao: texto(c.obs),
    dataBloqueio: data(c.dt_bloqueio),
    observacaoBloqueio: texto(c.obs_bloqueio),
    dataReativacao: data(c.dt_reativacao),
    observacaoReativacao: texto(c.obs_reativacao),
    primeiraCompra: data(c.primeira_compra),
    ultimaVisita: data(c.ultima_visita),
    ultimaCompra: data(c.ultima_compra),
    ultimoAtendimento: data(c.ultimo_atendimento),
    dataConsultaRfb: data(c.data_rfb),
  };
}

async function main() {
  console.log(
    `Conectando ao MySQL legado em ${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database}...`,
  );
  const conexao = await mysql.createConnection(MYSQL_CONFIG);

  const [clientesRows] = await conexao.query('SELECT * FROM cliente');
  const clientes = clientesRows as LegadoCliente[];
  const [vendedoresRows] = await conexao.query('SELECT id, cod_erp FROM vendedor');
  const vendedoresLegado = vendedoresRows as LegadoVendedorRef[];
  const [tabelasPrecoRows] = await conexao.query('SELECT id, cod_erp FROM tabela_preco');
  const tabelasPrecoLegado = tabelasPrecoRows as LegadoTabelaPrecoRef[];
  await conexao.end();
  console.log(`Legado: ${clientes.length} clientes, ${vendedoresLegado.length} vendedores.`);

  // id do vendedor no legado → cod_erp (chave de casamento com o cadastro novo).
  const vendedorLegadoCodErp = new Map<number, string>();
  for (const v of vendedoresLegado) {
    const codErp = texto(v.cod_erp);
    if (codErp) vendedorLegadoCodErp.set(v.id, codErp);
  }

  // id da tabela de preço no legado → cod_erp (idem, pra resolver
  // cliente.tabela_preco_id contra o cadastro novo de Tabela de Preço).
  const tabelaPrecoLegadoCodErp = new Map<number, string>();
  for (const t of tabelasPrecoLegado) {
    const codErp = texto(t.cod_erp);
    if (codErp) tabelaPrecoLegadoCodErp.set(t.id, codErp);
  }

  // Agrupa por empresa de destino (falha alto em filial_id desconhecido).
  const porAlias = new Map<string, LegadoCliente[]>();
  for (const c of clientes) {
    const alias = filialParaAlias(c.filial_id);
    const grupo = porAlias.get(alias) ?? [];
    grupo.push(c);
    porAlias.set(alias, grupo);
  }

  for (const [alias, grupo] of porAlias) {
    const empresa = await prisma.empresa.findUnique({ where: { alias } });
    if (!empresa) {
      throw new Error(`Empresa com alias "${alias}" não encontrada — rode o seed antes.`);
    }
    const empresaId = empresa.id;

    // "clientes"/"vendedores" têm RLS: leitura/escrita precisa rodar dentro
    // de transação com app.current_empresa_id setado — replica manualmente o
    // que PrismaService.withTenant faz (script roda fora do Nest/DI).
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${empresaId}, true)`;

        const [vendedoresNovos, tabelasPrecoNovas] = await Promise.all([
          tx.vendedor.findMany({
            where: { empresaId, deletedAt: null, codigoErp: { not: null } },
            select: { id: true, codigoErp: true },
          }),
          tx.tabelaPreco.findMany({
            where: { empresaId, deletedAt: null },
            select: { id: true, codigoErp: true },
          }),
        ]);
        const codErpParaVendedorId = new Map(
          vendedoresNovos.map((v) => [v.codigoErp as string, v.id]),
        );
        const codErpParaTabelaPrecoId = new Map(
          tabelasPrecoNovas.map((t) => [t.codigoErp, t.id]),
        );

        let semVendedor = 0;
        let semTabelaPreco = 0;
        const upserts = grupo.map((c) => {
          const codErpVendedor =
            c.vendedor_id != null ? vendedorLegadoCodErp.get(c.vendedor_id) : undefined;
          const vendedorId = codErpVendedor
            ? (codErpParaVendedorId.get(codErpVendedor) ?? null)
            : null;
          if (c.vendedor_id != null && !vendedorId) semVendedor++;

          const codErpTabelaPreco =
            c.tabela_preco_id != null ? tabelaPrecoLegadoCodErp.get(c.tabela_preco_id) : undefined;
          const tabelaPrecoId = codErpTabelaPreco
            ? (codErpParaTabelaPrecoId.get(codErpTabelaPreco) ?? null)
            : null;
          if (c.tabela_preco_id != null && !tabelaPrecoId) semTabelaPreco++;

          const codigoErp = texto(c.cod_erp) ?? `LEGADO-${c.id}`;
          const dados = mapearCliente(c, vendedorId, tabelaPrecoId);
          return { codigoErp, dados };
        });

        let gravados = 0;
        for (let i = 0; i < upserts.length; i += LOTE) {
          const chunk = upserts.slice(i, i + LOTE);
          await Promise.all(
            chunk.map(({ codigoErp, dados }) =>
              tx.cliente.upsert({
                where: { empresaId_codigoErp: { empresaId, codigoErp } },
                create: { ...dados, empresaId, codigoErp },
                update: dados,
              }),
            ),
          );
          gravados += chunk.length;
        }

        console.log(
          `— ${alias}: ${gravados} clientes gravados (upsert)` +
            (semVendedor
              ? `; ${semVendedor} com vendedor_id do legado sem correspondência no cadastro novo (ficaram sem carteira)`
              : '') +
            (semTabelaPreco
              ? `; ${semTabelaPreco} com tabela_preco_id do legado sem correspondência no cadastro novo (ficaram sem tabela de preço)`
              : ''),
        );
      },
      { timeout: 600_000 },
    );
  }

  console.log('Import de clientes concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
