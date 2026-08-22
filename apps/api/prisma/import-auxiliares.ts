/**
 * Importa os cadastros auxiliares do sistema legado (MySQL rcgdistc_portal)
 * via mysql2 em runtime — mesmo padrão de import-clientes.ts: idempotente e
 * reexecutável, com upsert por chave natural.
 *
 * Grupos:
 * - Globais (sem empresa): estados (sigla), municípios (cod_erp),
 *   ceps (cep). paises/cnae existem no legado mas estão vazios — nada a importar.
 * - Por empresa (RLS, empresa rcg): categorias + subcategorias (unificadas em
 *   Categoria via categoriaPaiId), condições de pagamento e armazéns, todos
 *   com upsert por (empresaId, codigoErp).
 *
 * Pré-requisitos: seed rodado (empresa rcg) e MySQL do dump acessível.
 *
 * Rodar (a partir da raiz do repo):
 *   pnpm --filter @plataforma/api exec ts-node prisma/import-auxiliares.ts
 * Dentro do container api (MySQL na rede do compose):
 *   MYSQL_HOST=mysql MYSQL_PORT=3306 pnpm --filter @plataforma/api exec ts-node prisma/import-auxiliares.ts
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

// Todos os auxiliares por empresa do dump têm filial_id NULL (mesma situação
// do import de clientes): a base legada é o portal da RCG.
const ALIAS_EMPRESA = 'rcg';

const texto = (v: string | null | undefined): string | null => {
  if (v == null) return null;
  const t = v.trim();
  return t === '' ? null : t;
};

interface LegadoEstado {
  id: number;
  cod_erp: string;
  sigla: string;
  descricao: string;
  codigo_ibge: string | null;
}

interface LegadoMunicipio {
  id: number;
  cod_erp: string;
  descricao: string;
  estado_id: number | null;
  codigo_ibge: string | null;
}

interface LegadoCep {
  id: number;
  cep: string | null;
  estado_id: number | null;
  cidade_id: number | null;
  bairro: string | null;
  endereco: string | null;
  longitude: number | null;
  latitude: number | null;
  service: string | null;
}

interface LegadoCategoria {
  id: number;
  cod_erp: string;
  descricao: string;
  status: string | null;
  usado: string | null;
}

interface LegadoSubCategoria {
  id: number;
  categoria_id: number;
  cod_erp: string;
  descricao: string;
  status: string | null;
}

interface LegadoCondicao {
  id: number;
  cod_erp: string;
  descricao: string;
  forma: string | null;
  status: string | null;
}

interface LegadoArmazem {
  id: number;
  cod_erp: string;
  descricao: string;
  status: string | null;
}

async function main() {
  console.log(
    `Conectando ao MySQL legado em ${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database}...`,
  );
  const conexao = await mysql.createConnection(MYSQL_CONFIG);
  const [estadosRows] = await conexao.query('SELECT * FROM estado');
  const [municipiosRows] = await conexao.query('SELECT * FROM municipio');
  const [cepsRows] = await conexao.query('SELECT * FROM cep');
  const [categoriasRows] = await conexao.query('SELECT * FROM categoria');
  const [subCategoriasRows] = await conexao.query('SELECT * FROM sub_categoria');
  const [condicoesRows] = await conexao.query('SELECT * FROM condicao_pagamento');
  const [armazensRows] = await conexao.query('SELECT * FROM armazem');
  await conexao.end();

  const estados = estadosRows as LegadoEstado[];
  const municipios = municipiosRows as LegadoMunicipio[];
  const ceps = cepsRows as LegadoCep[];
  const categorias = categoriasRows as LegadoCategoria[];
  const subCategorias = subCategoriasRows as LegadoSubCategoria[];
  const condicoes = condicoesRows as LegadoCondicao[];
  const armazens = armazensRows as LegadoArmazem[];

  // --- Globais (sem RLS) ---------------------------------------------------

  const estadoLegadoParaNovo = new Map<number, string>();
  for (const e of estados) {
    const novo = await prisma.estado.upsert({
      where: { sigla: e.sigla.trim() },
      create: {
        sigla: e.sigla.trim(),
        descricao: e.descricao.trim(),
        codigoErp: texto(e.cod_erp),
        codigoIbge: texto(e.codigo_ibge),
      },
      update: {
        descricao: e.descricao.trim(),
        codigoErp: texto(e.cod_erp),
        codigoIbge: texto(e.codigo_ibge),
      },
    });
    estadoLegadoParaNovo.set(e.id, novo.id);
  }
  console.log(`Estados: ${estados.length} gravados (upsert).`);

  const municipioLegadoParaNovo = new Map<number, string>();
  let gravados = 0;
  for (let i = 0; i < municipios.length; i += 200) {
    const chunk = municipios.slice(i, i + 200);
    await Promise.all(
      chunk.map(async (m) => {
        const codigoErp = texto(m.cod_erp) ?? `LEGADO-${m.id}`;
        const dados = {
          descricao: m.descricao.trim(),
          estadoId: m.estado_id != null ? (estadoLegadoParaNovo.get(m.estado_id) ?? null) : null,
          codigoIbge: texto(m.codigo_ibge),
        };
        const novo = await prisma.municipio.upsert({
          where: { codigoErp },
          create: { ...dados, codigoErp },
          update: dados,
        });
        municipioLegadoParaNovo.set(m.id, novo.id);
      }),
    );
    gravados += chunk.length;
  }
  console.log(`Municípios: ${gravados} gravados (upsert).`);

  let cepsGravados = 0;
  let cepsSemNumero = 0;
  for (const c of ceps) {
    const numero = texto(c.cep);
    if (!numero) {
      cepsSemNumero++;
      continue;
    }
    const dados = {
      estadoId: c.estado_id != null ? (estadoLegadoParaNovo.get(c.estado_id) ?? null) : null,
      municipioId: c.cidade_id != null ? (municipioLegadoParaNovo.get(c.cidade_id) ?? null) : null,
      bairro: texto(c.bairro),
      endereco: texto(c.endereco),
      latitude: c.latitude,
      longitude: c.longitude,
      origem: texto(c.service),
    };
    await prisma.cep.upsert({
      where: { cep: numero },
      create: { ...dados, cep: numero },
      update: dados,
    });
    cepsGravados++;
  }
  console.log(
    `CEPs: ${cepsGravados} gravados (upsert)` +
      (cepsSemNumero ? `; ${cepsSemNumero} ignorados sem número` : ''),
  );

  // --- Por empresa (RLS — set_config manual, como nos demais imports) ------

  const empresa = await prisma.empresa.findUnique({ where: { alias: ALIAS_EMPRESA } });
  if (!empresa) {
    throw new Error(`Empresa com alias "${ALIAS_EMPRESA}" não encontrada — rode o seed antes.`);
  }
  const empresaId = empresa.id;

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${empresaId}, true)`;

      // Categorias raiz primeiro (mapa id legado → id novo), depois as
      // subcategorias penduradas via categoriaPaiId.
      const categoriaLegadoParaNovo = new Map<number, string>();
      for (const c of categorias) {
        const codigoErp = c.cod_erp.trim();
        const dados = {
          descricao: c.descricao.trim(),
          ativo: c.status !== 'B',
          categoriaPaiId: null as string | null,
        };
        // `usado` só entra na CRIAÇÃO: o legado dá o valor inicial, e daí em
        // diante quem manda é a plataforma (Cadastros > Categorias marca quais
        // entram no Dashboard Comercial). Estava no `update` também, e assim
        // toda carga desfazia a marcação feita na tela — sem erro nenhum, o
        // dashboard só voltava ao que era.
        const usadoInicial = c.usado === 'S' ? true : c.usado === 'N' ? false : null;
        const nova = await tx.categoria.upsert({
          where: { empresaId_codigoErp: { empresaId, codigoErp } },
          create: { ...dados, empresaId, codigoErp, usado: usadoInicial },
          update: dados,
        });
        categoriaLegadoParaNovo.set(c.id, nova.id);
      }

      let subSemPai = 0;
      for (const s of subCategorias) {
        const pai = categoriaLegadoParaNovo.get(s.categoria_id) ?? null;
        if (!pai) subSemPai++;
        const codigoErp = s.cod_erp.trim();
        const dados = {
          descricao: s.descricao.trim(),
          ativo: s.status !== 'B',
          categoriaPaiId: pai,
        };
        // Mesmo tratamento das raízes: subcategoria nasce sem marcação e o
        // import não mexe nela depois. O legado não tem o campo aqui.
        await tx.categoria.upsert({
          where: { empresaId_codigoErp: { empresaId, codigoErp } },
          create: { ...dados, empresaId, codigoErp, usado: null },
          update: dados,
        });
      }
      console.log(
        `Categorias: ${categorias.length} raízes + ${subCategorias.length} subcategorias gravadas (upsert)` +
          (subSemPai ? `; ${subSemPai} subcategorias sem pai resolvido` : ''),
      );

      for (const c of condicoes) {
        const codigoErp = c.cod_erp.trim();
        const dados = {
          descricao: c.descricao.trim(),
          forma: texto(c.forma),
          // status aqui é S/N (não A/B como nas demais tabelas do legado).
          ativo: c.status !== 'N',
        };
        await tx.condicaoPagamento.upsert({
          where: { empresaId_codigoErp: { empresaId, codigoErp } },
          create: { ...dados, empresaId, codigoErp },
          update: dados,
        });
      }
      console.log(`Condições de pagamento: ${condicoes.length} gravadas (upsert).`);

      for (const a of armazens) {
        const codigoErp = a.cod_erp.trim();
        const dados = { descricao: a.descricao.trim(), ativo: a.status !== 'B' };
        await tx.armazem.upsert({
          where: { empresaId_codigoErp: { empresaId, codigoErp } },
          create: { ...dados, empresaId, codigoErp },
          update: dados,
        });
      }
      console.log(`Armazéns: ${armazens.length} gravados (upsert).`);
    },
    { timeout: 300_000 },
  );

  console.log('Import de auxiliares concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
