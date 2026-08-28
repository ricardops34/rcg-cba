import { ConflictException } from '@nestjs/common';

/**
 * O que fazer quando a chave enviada pelo ERP já existe na plataforma.
 *
 * Regra do plano da integração: **o ERP é a fonte da verdade**, então reenviar
 * um registro que foi excluído *ressuscita* o registro, em vez de recusá-lo.
 * Sem isso, o `codigoErp`/`codigoLegado` de um registro excluído virava um
 * beco sem saída — o POST recusava com 409 ("já existe", contando o
 * soft-deletado) e o PATCH não achava nada (filtra `deletedAt: null`), então
 * aquele código ficava inutilizável para sempre pela integração.
 *
 * Três respostas possíveis:
 *
 * - registro não existe → `false`: o caminho normal de criação;
 * - existe e está **ativo** → 409, como antes (o ERP deve usar PATCH);
 * - existe e está **excluído** → `true`: quem chama atualiza a linha com os
 *   dados novos e limpa `deletedAt`/`deletedBy`.
 *
 * A reativação carrega os dados do payload de propósito: o registro volta como
 * o ERP o descreve agora, não como estava no dia em que foi excluído.
 */
export function deveReativar(
  existente: { deletedAt: Date | null } | null,
  mensagemConflito: string,
): boolean {
  if (!existente) return false;
  if (!existente.deletedAt) throw new ConflictException(mensagemConflito);
  return true;
}

/** Campos que limpam o soft delete — sempre juntos, para não sobrar meio estado. */
export const LIMPAR_EXCLUSAO = { deletedAt: null, deletedBy: null } as const;
