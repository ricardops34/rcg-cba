import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Valores de comissão (o % de cada item de orçamento e de nota de saída) são
 * informação restrita: o perfil Vendedor não deve enxergá-los. Duas camadas
 * decidem quem vê:
 *
 * 1. o parâmetro `COMISSAO_OCULTA_PARA_TODOS` da empresa, que esconde de
 *    todo mundo quando ligado (Administração > Parâmetros);
 * 2. a permissão `comissao.visualizar` do perfil, configurável na tela de
 *    Perfis.
 *
 * Filtrar na resposta da API, e não só esconder a coluna na tela, é o que
 * garante que o dado não trafega para quem não pode ver.
 */
export function podeVerComissao(
  user: AuthenticatedUser,
  ocultaParaTodos = false,
): boolean {
  if (ocultaParaTodos) return false;
  return user.isAdmin || user.permissoes.includes('comissao.visualizar');
}

/** Remove o percentual de comissão dos itens quando o usuário não pode vê-lo. */
export function ocultarComissaoDosItens<
  T extends { itens?: { percComissao?: number | null }[] },
>(registro: T, user: AuthenticatedUser, ocultaParaTodos = false): T {
  if (podeVerComissao(user, ocultaParaTodos) || !registro?.itens) {
    return registro;
  }
  return {
    ...registro,
    itens: registro.itens.map((item) => ({ ...item, percComissao: null })),
  };
}
