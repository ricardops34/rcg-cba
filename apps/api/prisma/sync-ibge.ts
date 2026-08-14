/**
 * Sincroniza as tabelas de referência a partir das APIs públicas do IBGE:
 * estados, municípios e **CNAEs** (subclasses). Idempotente e reexecutável —
 * upsert por chave natural, como os scripts de import.
 *
 * O motivo principal é a tabela `cnaes`, que veio vazia do legado (o dump tinha
 * a tabela, sem linhas). Sem ela não há em que apoiar o CNAE do cliente
 * (`cliente_cnaes`), que por sua vez é o eixo de afinidade da sugestão de
 * compra.
 *
 * Estados e municípios já foram importados do ERP e **não são recriados**: o
 * sync completa/corrige o código IBGE e a descrição dos que já existem. O
 * casamento é por código **e** por nome+UF, nessa ordem — o `codigo_ibge` que
 * veio do ERP é inconfiável (municípios de SP gravados como 34xxxxx quando o
 * código oficial começa em 35), e casar só pelo código duplicaria 361 cidades
 * que já estão referenciadas por CEPs e clientes.
 *
 * Precisa da role dona (`plataforma`) — ver docs/runbook-operacao.md.
 *
 * Rodar (a partir da raiz do repo):
 *   pnpm --filter @plataforma/api exec ts-node prisma/sync-ibge.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const IBGE_BASE_URL =
  process.env.IBGE_BASE_URL ?? 'https://servicodados.ibge.gov.br';

const texto = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};

async function buscar<T>(caminho: string): Promise<T> {
  const url = `${IBGE_BASE_URL}${caminho}`;
  const resposta = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resposta.ok) {
    throw new Error(`IBGE respondeu ${resposta.status} em ${caminho}`);
  }
  return (await resposta.json()) as T;
}

interface IbgeEstado {
  id: number;
  sigla: string;
  nome: string;
}

interface IbgeMunicipio {
  id: number;
  nome: string;
  microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } } | null;
  // Municípios novos vêm por `regiao-imediata` em vez de `microrregiao`.
  ['regiao-imediata']?: {
    ['regiao-intermediaria']?: { UF?: { sigla?: string } };
  } | null;
}

/** A subclasse traz a hierarquia aninhada: classe → grupo → divisão → seção. */
interface IbgeSubclasse {
  id: string;
  descricao: string;
  classe?: {
    id?: string;
    grupo?: { id?: string; divisao?: { id?: string; secao?: { id?: string } } };
  } | null;
}

function ufDoMunicipio(m: IbgeMunicipio): string | null {
  return (
    texto(m.microrregiao?.mesorregiao?.UF?.sigla) ??
    texto(m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla)
  );
}

async function sincronizarEstados(): Promise<Map<string, string>> {
  const estados = await buscar<IbgeEstado[]>('/api/v1/localidades/estados');
  const siglaParaId = new Map<string, string>();

  for (const e of estados) {
    const sigla = e.sigla.trim().toUpperCase();
    const registro = await prisma.estado.upsert({
      where: { sigla },
      create: {
        sigla,
        descricao: e.nome.trim(),
        codigoIbge: String(e.id),
      },
      // Não sobrescreve `descricao` à toa, mas o código IBGE é da fonte
      // oficial e vale mais que o que veio do ERP.
      update: { codigoIbge: String(e.id) },
    });
    siglaParaId.set(sigla, registro.id);
  }

  console.log(`Estados: ${estados.length} sincronizados.`);
  return siglaParaId;
}

/** Sem acento, sem caixa e sem espaço duplicado — "SÃO PAULO" casa com "São Paulo". */
const normalizar = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

async function sincronizarMunicipios(siglaParaId: Map<string, string>) {
  const municipios = await buscar<IbgeMunicipio[]>(
    '/api/v1/localidades/municipios',
  );

  // Casar por nome+UF é a via principal, não a de exceção: o `codigo_ibge` que
  // veio do ERP é inconfiável (os municípios de SP, por exemplo, estão
  // gravados como 34xxxxx quando o código real começa em 35). Confiar só no
  // código criaria uma segunda linha para município que já existe — e aí
  // clientes e CEPs ficariam apontando para cidades diferentes com o mesmo
  // nome.
  const existentes = await prisma.municipio.findMany({
    where: { deletedAt: null },
    select: { id: true, descricao: true, estadoId: true, codigoIbge: true },
  });
  const chaveNome = (descricao: string, estadoId: string | null) =>
    `${normalizar(descricao)}|${estadoId ?? ''}`;

  const porCodigo = new Map(
    existentes
      .filter((m) => m.codigoIbge)
      .map((m) => [m.codigoIbge as string, m.id]),
  );
  const porNome = new Map(
    existentes.map((m) => [chaveNome(m.descricao, m.estadoId), m.id]),
  );

  let criados = 0;
  let atualizados = 0;
  let codigosCorrigidos = 0;
  let semUf = 0;

  for (const m of municipios) {
    const codigoIbge = String(m.id);
    const sigla = ufDoMunicipio(m);
    const estadoId = sigla ? (siglaParaId.get(sigla) ?? null) : null;
    if (!estadoId) semUf += 1;

    const porCodigoId = porCodigo.get(codigoIbge);
    if (porCodigoId) {
      await prisma.municipio.update({
        where: { id: porCodigoId },
        data: { descricao: m.nome.trim(), estadoId: estadoId ?? undefined },
      });
      atualizados += 1;
      continue;
    }

    const porNomeId = porNome.get(chaveNome(m.nome, estadoId));
    if (porNomeId) {
      // Nome bate mas o código não: o registro existente está com código
      // errado (ou sem código) — a fonte oficial corrige.
      await prisma.municipio.update({
        where: { id: porNomeId },
        data: { codigoIbge, descricao: m.nome.trim() },
      });
      porCodigo.set(codigoIbge, porNomeId);
      codigosCorrigidos += 1;
      continue;
    }

    const novo = await prisma.municipio.create({
      data: { codigoIbge, descricao: m.nome.trim(), estadoId },
    });
    porCodigo.set(codigoIbge, novo.id);
    porNome.set(chaveNome(m.nome, estadoId), novo.id);
    criados += 1;
  }

  console.log(
    `Municípios: ${atualizados} atualizados, ${codigosCorrigidos} com código IBGE corrigido, ` +
      `${criados} criados` +
      (semUf ? ` (${semUf} sem UF resolvida).` : '.'),
  );
}

async function sincronizarCnaes() {
  const subclasses = await buscar<IbgeSubclasse[]>('/api/v2/cnae/subclasses');

  let gravados = 0;
  for (const s of subclasses) {
    // O id vem formatado ("0111-3/01"); guardamos só os dígitos, que é como
    // MinhaReceita e o cadastro do cliente referenciam o CNAE.
    const codigo = s.id.replace(/\D/g, '');
    if (!codigo) continue;

    const classe = s.classe;
    const grupo = classe?.grupo;
    const divisao = grupo?.divisao;

    const dados = {
      descricao: s.descricao.trim(),
      subclasse: codigo,
      classe: texto(classe?.id),
      grupo: texto(grupo?.id),
      divisao: texto(divisao?.id),
      secao: texto(divisao?.secao?.id),
      ativo: true,
    };

    await prisma.cnae.upsert({
      where: { codigoErp: codigo },
      create: { ...dados, codigoErp: codigo },
      update: dados,
    });
    gravados += 1;
  }

  console.log(`CNAEs: ${gravados} subclasses sincronizadas.`);
}

async function main() {
  console.log(`Sync IBGE — fonte: ${IBGE_BASE_URL}`);
  const siglaParaId = await sincronizarEstados();
  await sincronizarMunicipios(siglaParaId);
  await sincronizarCnaes();
  console.log('Sync do IBGE concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
