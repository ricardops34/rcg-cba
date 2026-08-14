/**
 * Carga em lote do CNAE dos clientes, a partir do CNPJ, na base pública da
 * Receita Federal (MinhaReceita).
 *
 * **Grava apenas os CNAEs** (`cliente_cnaes`). Não toca em nenhum campo do
 * cadastro — endereço, razão social e telefone continuam sendo tratados cliente
 * a cliente pelo botão "Consultar CNPJ" da tela. Essa separação é deliberada: a
 * fila de aprovação (ver `cliente-alteracoes.service.ts`) cobre os campos do
 * cliente, então um lote que os alterasse abriria centenas de solicitações de
 * uma vez, e ninguém revisaria.
 *
 * Sem CNAE carregado, a sugestão de compra por afinidade de ramo nasce sem
 * lastro — é para isso que este script existe.
 *
 * Idempotente: pula cliente que já tem CNAE vinculado (salvo `--refazer`) e o
 * vínculo é upsert por (cliente, cnae).
 *
 * Pré-requisito: `sync:ibge` rodado (a referência `cnaes` precisa estar
 * populada, senão não há a que vincular).
 *
 * Precisa da role dona (`plataforma`) — ver docs/runbook-operacao.md.
 *
 * Uso:
 *   ts-node prisma/enrich-cnae.ts [--empresa=rcg] [--todos] [--refazer]
 *                                 [--limite=N] [--intervalo=1000]
 *
 *   --todos      inclui clientes inativos (padrão: só ativos)
 *   --refazer    reconsulta quem já tem CNAE vinculado
 *   --limite=N   processa no máximo N clientes (para testar em amostra)
 *   --intervalo  ms entre chamadas (padrão 1000) — cortesia com o serviço
 *                público, que é gratuito e compartilhado
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MINHARECEITA_BASE_URL =
  process.env.MINHARECEITA_BASE_URL ?? 'https://minhareceita.org';

const arg = (nome: string): string | undefined => {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado?.split('=')[1];
};
const flag = (nome: string) => process.argv.includes(`--${nome}`);

const ALIAS_EMPRESA = arg('empresa') ?? 'rcg';
const INCLUIR_INATIVOS = flag('todos');
const REFAZER = flag('refazer');
const LIMITE = Number(arg('limite')) || undefined;
const INTERVALO_MS = Number(arg('intervalo')) || 1000;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const digitos = (v: unknown): string =>
  typeof v === 'string' || typeof v === 'number'
    ? String(v).replace(/\D/g, '')
    : '';

/**
 * Código de subclasse em 7 dígitos. O JSON da Receita manda o código como
 * número, então o zero à esquerda se perde ("0111399" chega 111399) — sem o
 * padding, todo CNAE da seção A (agropecuária) seria descartado.
 */
const codigoCnae = (v: unknown): string | null => {
  const d = digitos(v);
  if (!d || Number(d) === 0) return null;
  return d.length <= 7 ? d.padStart(7, '0') : null;
};

interface MinhaReceitaResposta {
  cnae_fiscal?: number | string;
  cnaes_secundarios?: { codigo?: number | string }[];
  cnaes_secundarias?: { codigo?: number | string }[];
  descricao_situacao_cadastral?: string;
}

interface CnaeDoCnpj {
  codigo: string;
  principal: boolean;
}

async function consultarCnpj(cnpj: string): Promise<{
  cnaes: CnaeDoCnpj[];
  situacao: string | null;
} | null> {
  const resposta = await fetch(`${MINHARECEITA_BASE_URL}/${cnpj}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'plataforma-comercial/1.0 (+carga-cnae)',
    },
  });

  // 400/404 = CNPJ que a base não conhece (baixado, inválido). Não é falha do
  // lote: segue para o próximo.
  if (resposta.status === 400 || resposta.status === 404) return null;
  if (!resposta.ok) {
    throw new Error(`MinhaReceita respondeu ${resposta.status}`);
  }

  const dados = (await resposta.json()) as MinhaReceitaResposta;
  const cnaes: CnaeDoCnpj[] = [];

  const principal = codigoCnae(dados.cnae_fiscal);
  if (principal) cnaes.push({ codigo: principal, principal: true });

  const secundarios = dados.cnaes_secundarios ?? dados.cnaes_secundarias ?? [];
  for (const s of secundarios) {
    const codigo = codigoCnae(s.codigo);
    if (!codigo) continue;
    if (cnaes.some((c) => c.codigo === codigo)) continue;
    cnaes.push({ codigo, principal: false });
  }

  return { cnaes, situacao: dados.descricao_situacao_cadastral ?? null };
}

async function main() {
  const empresa = await prisma.empresa.findFirst({
    where: { alias: ALIAS_EMPRESA },
    select: { id: true, nomeFantasia: true },
  });
  if (!empresa) throw new Error(`Empresa com alias '${ALIAS_EMPRESA}' não encontrada`);

  const totalReferencia = await prisma.cnae.count({ where: { deletedAt: null } });
  if (totalReferencia === 0) {
    throw new Error(
      'A referência de CNAEs está vazia. Rode `sync:ibge` antes — sem ela não há a que vincular.',
    );
  }

  const clientes = await prisma.cliente.findMany({
    where: {
      empresaId: empresa.id,
      deletedAt: null,
      tipoPessoa: 'juridica',
      cnpjCpf: { not: null },
      ...(INCLUIR_INATIVOS ? {} : { ativo: true }),
    },
    select: { id: true, razaoSocial: true, cnpjCpf: true },
    orderBy: { razaoSocial: 'asc' },
  });

  // Quem já tem CNAE fica de fora, salvo --refazer: o lote é retomável, então
  // uma interrupção no meio não obriga a refazer tudo (nem a bater de novo no
  // serviço público).
  const jaTem = REFAZER
    ? new Set<string>()
    : new Set(
        (
          await prisma.clienteCnae.findMany({
            where: { empresaId: empresa.id, deletedAt: null },
            select: { clienteId: true },
            distinct: ['clienteId'],
          })
        ).map((c) => c.clienteId),
      );

  const alvo = clientes
    .filter((c) => digitos(c.cnpjCpf).length === 14)
    .filter((c) => !jaTem.has(c.id))
    .slice(0, LIMITE);

  console.log(`Empresa: ${empresa.nomeFantasia} (${ALIAS_EMPRESA})`);
  console.log(`Referência: ${totalReferencia} CNAEs carregados.`);
  console.log(
    `Clientes a consultar: ${alvo.length}` +
      (jaTem.size ? ` (${jaTem.size} já tinham CNAE e foram pulados)` : '') +
      `. Intervalo: ${INTERVALO_MS}ms.`,
  );
  if (alvo.length === 0) {
    console.log('Nada a fazer.');
    return;
  }

  // Um mapa código → id evita uma consulta por CNAE de cada cliente.
  const referencia = new Map(
    (
      await prisma.cnae.findMany({
        where: { deletedAt: null },
        select: { id: true, codigoErp: true },
      })
    )
      .filter((c) => c.codigoErp)
      .map((c) => [c.codigoErp as string, c.id]),
  );

  let comCnae = 0;
  let semCnae = 0;
  let naoEncontrado = 0;
  let erros = 0;
  let vinculos = 0;
  const codigosForaDaReferencia = new Set<string>();

  for (const [i, cliente] of alvo.entries()) {
    const cnpj = digitos(cliente.cnpjCpf);
    const posicao = `[${String(i + 1).padStart(String(alvo.length).length)}/${alvo.length}]`;

    try {
      const resultado = await consultarCnpj(cnpj);
      if (!resultado) {
        naoEncontrado += 1;
        console.log(`${posicao} CNPJ não encontrado — ${cliente.razaoSocial}`);
      } else if (resultado.cnaes.length === 0) {
        semCnae += 1;
        console.log(`${posicao} sem CNAE na base — ${cliente.razaoSocial}`);
      } else {
        let gravados = 0;
        for (const c of resultado.cnaes) {
          const cnaeId = referencia.get(c.codigo);
          if (!cnaeId) {
            // Código válido que não está na nossa referência = sync do IBGE
            // desatualizado. Reportado no fim, sem interromper o lote.
            codigosForaDaReferencia.add(c.codigo);
            continue;
          }
          await prisma.clienteCnae.upsert({
            where: {
              clienteId_cnaeId: { clienteId: cliente.id, cnaeId },
            },
            create: {
              empresaId: empresa.id,
              clienteId: cliente.id,
              cnaeId,
              principal: c.principal,
              createdBy: 'carga-cnae',
              updatedBy: 'carga-cnae',
            },
            update: {
              principal: c.principal,
              deletedAt: null,
              deletedBy: null,
              updatedBy: 'carga-cnae',
            },
          });
          gravados += 1;
        }
        vinculos += gravados;
        if (gravados > 0) comCnae += 1;
        else semCnae += 1;
        console.log(
          `${posicao} ${gravados} CNAE(s) — ${cliente.razaoSocial}` +
            (resultado.situacao && resultado.situacao !== 'ATIVA'
              ? ` (situação: ${resultado.situacao})`
              : ''),
        );
      }
    } catch (e) {
      erros += 1;
      console.warn(
        `${posicao} ERRO — ${cliente.razaoSocial}: ${
          e instanceof Error ? e.message : 'desconhecido'
        }`,
      );
    }

    // Cortesia com o serviço público (gratuito e compartilhado): uma chamada
    // por segundo, não um flood de 800 requisições em paralelo.
    if (i < alvo.length - 1) await dormir(INTERVALO_MS);
  }

  console.log('\n--- Resumo ---');
  console.log(`Clientes com CNAE gravado: ${comCnae}`);
  console.log(`Sem CNAE na base:          ${semCnae}`);
  console.log(`CNPJ não encontrado:       ${naoEncontrado}`);
  console.log(`Erros:                     ${erros}`);
  console.log(`Vínculos gravados:         ${vinculos}`);
  if (codigosForaDaReferencia.size > 0) {
    console.log(
      `\nAtenção: ${codigosForaDaReferencia.size} código(s) não estão na referência ` +
        `local — rode \`sync:ibge\` e reexecute com --refazer:\n  ` +
        [...codigosForaDaReferencia].join(', '),
    );
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
