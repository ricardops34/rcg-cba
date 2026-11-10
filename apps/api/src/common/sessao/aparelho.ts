/**
 * Tipo de aparelho da sessão, deduzido do navegador.
 *
 * Sessão única por tipo de aparelho (decisão de 2026-11-10): um login novo só
 * derruba a sessão aberta do mesmo tipo, para o vendedor ficar no computador e
 * no celular ao mesmo tempo.
 *
 * O `User-Agent` é declarado pelo cliente, e quem o falsifica só ganha o que a
 * regra já concede — uma sessão de cada tipo. Não é barreira de acesso; senha,
 * expediente e permissão continuam valendo igual nos dois.
 *
 * iPad com Safari se apresenta como Mac ("modo computador") e conta como
 * computador; tablet Android sem "Mobile" também. É o que o aparelho mostra:
 * a tela grande recebe o sistema inteiro.
 */
export type Aparelho = 'computador' | 'celular';

const CELULAR =
  /Mobi|Android.+Mobile|iPhone|iPod|Windows Phone|Opera Mini|IEMobile/i;

export function aparelhoDoNavegador(
  userAgent: string | null | undefined,
): Aparelho {
  return userAgent && CELULAR.test(userAgent) ? 'celular' : 'computador';
}
