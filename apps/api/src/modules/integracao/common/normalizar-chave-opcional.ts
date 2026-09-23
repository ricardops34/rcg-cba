/**
 * Normaliza chaves compostas opcionais vindas do Protheus.
 *
 * Campos vazios de tabelas compartilhadas podem chegar como `01-`: a filial
 * foi concatenada, mas o código do relacionamento estava em branco. Isso
 * representa ausência de vínculo e não uma chave a ser procurada no banco.
 */
export function normalizarChaveOpcional(
  chave: string | null | undefined,
): string | null {
  const valor = chave?.trim();
  if (!valor) return null;

  const separador = valor.lastIndexOf('-');
  if (separador >= 0 && valor.slice(separador + 1).trim() === '') return null;

  return valor;
}
