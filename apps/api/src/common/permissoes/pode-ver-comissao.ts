import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Valores de comissão (o % de cada item de orçamento e de nota de saída) são
 * informação restrita: o perfil Vendedor não deve enxergá-los. Quem libera é a
 * permissão `comissao.visualizar`, configurável por perfil na tela de Perfis —
 * assim a regra muda sem deploy.
 *
 * Filtrar na resposta da API, e não só esconder a coluna na tela, é o que
 * garante que o dado não trafega para quem não pode ver.
 */
export function podeVerComissao(user: AuthenticatedUser): boolean {
  return user.isAdmin || user.permissoes.includes('comissao.visualizar');
}

/** Remove o percentual de comissão dos itens quando o usuário não pode vê-lo. */
export function ocultarComissaoDosItens<
  T extends { itens?: { percComissao?: number | null }[] },
>(registro: T, user: AuthenticatedUser): T {
  if (podeVerComissao(user) || !registro?.itens) return registro;
  return {
    ...registro,
    itens: registro.itens.map((item) => ({ ...item, percComissao: null })),
  };
}
