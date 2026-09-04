import type { SituacaoEmpresa } from '@prisma/client';

/**
 * O que a plataforma precisa saber de uma empresa para decidir o acesso.
 * Propositalmente mínimo: qualquer consulta consegue selecionar estes dois
 * campos, e assim ninguém precisa carregar a empresa inteira só para perguntar
 * se ela pode entrar.
 */
export type EmpresaAcesso = {
  situacao: SituacaoEmpresa;
  testeExpiraEm: Date | null;
};

/**
 * **A** decisão de acesso da plataforma. Não existe outra — se aparecer um
 * segundo lugar comparando `situacao`, os dois vão divergir, que foi
 * exatamente o motivo de o campo `ativo` ter saído do schema.
 *
 * - `ativa` entra, sempre.
 * - `teste` entra enquanto não vencer. Sem data, é avaliação sem prazo: entra
 *   até alguém encerrar na mão.
 * - `suspensa` e `cancelada` não entram.
 */
export function podeAcessar(empresa: EmpresaAcesso, agora = new Date()): boolean {
  switch (empresa.situacao) {
    case 'ativa':
      return true;
    case 'teste':
      return empresa.testeExpiraEm === null || empresa.testeExpiraEm > agora;
    case 'suspensa':
    case 'cancelada':
      return false;
  }
}

/**
 * A frase que o usuário vê quando não consegue entrar, ou `null` se ele pode.
 *
 * Fica junto de `podeAcessar` de propósito: são a mesma decisão dita de duas
 * formas, e separá-las abriria a porta para uma mensagem que não corresponde
 * ao bloqueio. Nenhuma delas revela detalhe comercial — quem está na tela de
 * login pode não ser da empresa.
 */
export function motivoBloqueio(
  empresa: EmpresaAcesso,
  agora = new Date(),
): string | null {
  if (podeAcessar(empresa, agora)) return null;
  if (empresa.situacao === 'teste') {
    return 'O período de avaliação desta empresa terminou. Fale com o responsável comercial para liberar o acesso.';
  }
  if (empresa.situacao === 'cancelada') {
    return 'O acesso desta empresa foi encerrado. Fale com o responsável comercial.';
  }
  return 'O acesso desta empresa está suspenso. Fale com o responsável comercial.';
}

/**
 * Recorte Prisma das empresas que podem entrar, para as consultas que listam
 * vínculos e não teriam onde exibir um motivo — o `me()`, por exemplo, que
 * monta o seletor de empresas.
 *
 * Aqui filtrar é o certo; no login, não. Lá a empresa precisa ser encontrada
 * **e então** recusada, senão o usuário de uma empresa suspensa recebe "sem
 * vínculo com a empresa", que manda ele procurar o problema no lugar errado.
 */
export function whereEmpresaAcessivel(agora = new Date()) {
  return {
    OR: [
      { situacao: 'ativa' as const },
      {
        situacao: 'teste' as const,
        OR: [{ testeExpiraEm: null }, { testeExpiraEm: { gt: agora } }],
      },
    ],
  };
}
