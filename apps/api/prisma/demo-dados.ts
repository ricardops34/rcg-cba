import { PrismaClient } from '@prisma/client';
import {
  apagarDemo,
  gerarDemo,
  type ResumoDemo,
} from '../src/modules/demo/demo-gerador';

/**
 * Linha de comando da base de demonstração.
 *
 * **A geração não mora aqui.** Ela está em
 * `src/modules/demo/demo-gerador.ts`, compartilhada com a tela de
 * Administração — duas cópias do mesmo gerador divergiriam na primeira
 * alteração, e a demonstração passaria a depender de por onde foi disparada.
 *
 * O que sobra para este arquivo é o que só existe na linha de comando: abrir a
 * conexão, escolher a empresa, ler os argumentos e imprimir o resultado.
 *
 * **Precisa da role dona (`plataforma`)**, como as migrations e o seed: aqui os
 * `INSERT` acontecem fora de `withTenant`, então dependem de não haver RLS
 * filtrando. Pela tela é o contrário — lá a RLS fica ligada e é ela que impede
 * o gerador de alcançar outra empresa. Ver docs/runbook-operacao.md.
 *
 * ```bash
 * pnpm --filter @plataforma/api demo:dados
 * pnpm --filter @plataforma/api demo:dados -- --empresa=BJSoftware
 * pnpm --filter @plataforma/api demo:dados -- --limpar
 * ```
 */

const prisma = new PrismaClient();

/** `--empresa=<texto>`, quando informado. */
function empresaPedida(): string | null {
  const arg = process.argv.find((a) => a.startsWith('--empresa='));
  return arg ? arg.slice('--empresa='.length).trim() || null : null;
}

/**
 * A empresa alvo: a pedida por nome/CNPJ/id, ou a mais antiga.
 *
 * O padrão continua sendo a mais antiga porque numa base criada pelo
 * `seed-base.ts` ela é a única que existe. `--empresa=` passa a importar
 * quando o cluster tem mais de um tenant — aí "a mais antiga" vira uma
 * escolha silenciosa, e popular a empresa errada com dado fictício é um
 * estrago que só aparece na frente do cliente.
 */
async function escolherEmpresa(pedida: string | null) {
  if (!pedida) {
    return prisma.empresa.findFirstOrThrow({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  const candidatas = await prisma.empresa.findMany({
    where: {
      deletedAt: null,
      OR: [
        { id: pedida },
        { cnpj: pedida },
        { razaoSocial: { contains: pedida, mode: 'insensitive' } },
        { nomeFantasia: { contains: pedida, mode: 'insensitive' } },
      ],
    },
  });

  if (candidatas.length === 0) {
    throw new Error(`Nenhuma empresa encontrada para "${pedida}".`);
  }
  // Ambiguidade não se resolve no escuro: com duas candidatas, escolher uma
  // seria adivinhar qual base o operador queria popular.
  if (candidatas.length > 1) {
    throw new Error(
      `"${pedida}" casa com ${candidatas.length} empresas:\n` +
        candidatas
          .map((e) => `  ${e.id} — ${e.razaoSocial} (${e.cnpj ?? 'sem CNPJ'})`)
          .join('\n') +
        '\nInforme o CNPJ ou o id.',
    );
  }
  return candidatas[0];
}

function imprimir(r: ResumoDemo) {
  console.log(
    [
      `Base de demonstração criada em "${r.empresa}":`,
      `  período: ${r.periodo.join(', ')}`,
      `  ${r.usuarios} usuários (1 gerente, 2 supervisores, 6 vendedores)` +
        (r.adminVirouVendedor
          ? ' + o administrador, agora com cadastro de vendedor'
          : ''),
      `  ${r.clientes} clientes (com CNAE), ${r.produtos} produtos`,
      `  ${r.notas} notas com XML de NF-e, ${r.titulos} títulos ` +
        `(${r.titulosComBoleto} com boleto Bradesco reemitível)`,
      `  ${r.orcamentos} orçamentos (aprovados, pendentes e recusados)`,
      `  ${r.conversas} conversas de WhatsApp, ${r.atividades} atividades`,
      '',
      `Entre com a senha ${r.senha}:`,
      ...r.acessos.map((a) => `  ${a.email} — ${a.perfil}`),
    ].join('\n'),
  );
}

async function main() {
  const empresa = await escolherEmpresa(empresaPedida());

  if (process.argv.includes('--limpar')) {
    await apagarDemo(prisma, empresa.id);
    console.log(
      `Dados de demonstração removidos de "${empresa.nomeFantasia ?? empresa.razaoSocial}".`,
    );
    return;
  }

  imprimir(await gerarDemo(prisma, empresa.id));
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
