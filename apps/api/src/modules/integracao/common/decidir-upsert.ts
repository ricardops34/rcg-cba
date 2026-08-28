/**
 * O que fazer quando a chave enviada pelo ERP já existe na plataforma.
 *
 * Regra fechada da integração: **o ERP é a fonte da verdade**, e o `POST` de
 * cada entidade é um *upsert* por `codigoErp`. O ERP não tem como saber se um
 * registro já subiu — ele manda o que mudou, e é a plataforma que reconhece.
 *
 * Três respostas possíveis:
 *
 * - registro não existe → `'criar'`;
 * - existe e está **ativo** → `'atualizar'`: a linha recebe o payload inteiro;
 * - existe e está **excluído** → `'reativar'`: mesma atualização, mais a
 *   limpeza de `deletedAt`/`deletedBy`.
 *
 * Nenhum dos três é erro. O 409 que existia aqui ("já existe, use PATCH")
 * obrigava o ERP a tentar `POST`, apanhar, e refazer como `PATCH` — duas
 * requisições para cada registro que mudou, contra um teto de 60 req/min por
 * IP. E deixava o código de um registro excluído num beco sem saída: o `POST`
 * recusava contando o soft-deletado e o `PATCH` não achava nada, porque filtra
 * `deletedAt: null`.
 *
 * A reativação carrega os dados do payload de propósito: o registro volta como
 * o ERP o descreve agora, não como estava no dia em que foi excluído.
 */
export type DecisaoUpsert = 'criar' | 'atualizar' | 'reativar';

export function decidirUpsert(
  existente: { deletedAt: Date | null } | null,
): DecisaoUpsert {
  if (!existente) return 'criar';
  return existente.deletedAt ? 'reativar' : 'atualizar';
}

/**
 * Os campos a acrescentar ao `update` conforme a decisão: só a reativação
 * limpa o soft delete. Serve para quem chama montar um `update` só, sem
 * ramificar o código entre "atualizar" e "reativar" — o que muda entre os dois
 * é exatamente isto.
 */
export function camposDaDecisao(
  decisao: DecisaoUpsert,
): typeof LIMPAR_EXCLUSAO | Record<string, never> {
  return decisao === 'reativar' ? LIMPAR_EXCLUSAO : {};
}

/** Campos que limpam o soft delete — sempre juntos, para não sobrar meio estado. */
export const LIMPAR_EXCLUSAO = { deletedAt: null, deletedBy: null } as const;
