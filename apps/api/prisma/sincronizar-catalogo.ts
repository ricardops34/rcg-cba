import { PrismaClient } from '@prisma/client';
import {
  corrigirPermissoesDoDiretor,
  sincronizarEstrutura,
} from './catalogo-sistema';

/**
 * Aplica o catálogo do sistema (módulos, menus, rotinas) numa base **que já
 * existe**, sem apagar nada.
 *
 * É o par do `seed-base.ts`: os dois aplicam a mesma definição
 * (`catalogo-sistema.ts`), mas o seed **destrói a base** antes e por isso nunca
 * roda contra dado real (ver docs/runbook-operacao.md). Este aqui é o caminho
 * para produção — só cria o que falta e atualiza o texto do menu.
 *
 * Rode-o depois de `prisma migrate deploy` sempre que um menu ou uma rotina
 * tiver mudado. É idempotente: rodar duas vezes não faz nada na segunda.
 *
 * **Precisa da role dona (`plataforma`)**, não da `plataforma_app` do runtime —
 * a mesma regra das migrations e do seed.
 *
 * O que ele **não** faz: conceder permissão a perfil. Permissão gravada é
 * configuração do cliente (o administrador pode ter desmarcado algo de
 * propósito), e recolocá-la a cada deploy desfaria a decisão dele. Conceder algo
 * a uma base existente continua sendo trabalho de uma migration escrita para
 * aquela decisão.
 *
 * A única permissão que ele retira é a do perfil Diretor sobre rotinas de
 * Administração, e isso é correção de segurança — ver `corrigirPermissoesDoDiretor`.
 */
async function main() {
  const prisma = new PrismaClient();
  try {
    const criados = await sincronizarEstrutura(prisma);
    const removidas = await corrigirPermissoesDoDiretor(prisma);

    console.log(
      `Catálogo aplicado: ${criados.modulos} módulo(s), ${criados.menus} menu(s) e ` +
        `${criados.rotinas} rotina(s) criados.`,
    );
    if (removidas > 0) {
      console.log(
        `Diretor: ${removidas} permissão(ões) de Administração retirada(s) — ` +
          'ver catalogo-sistema.ts.',
      );
    }
    if (criados.modulos + criados.menus + criados.rotinas + removidas === 0) {
      console.log('Nada a fazer: a base já estava em dia com o catálogo.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
