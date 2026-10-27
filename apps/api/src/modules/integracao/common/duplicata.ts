/**
 * F1_DUPL / F2_DUPL → colunas da nota (entrada e saída). Omitido não mexe em
 * nada: uma integração que ainda não manda o campo não pode apagar o que outra
 * já informou, nem marcar a nota como "sem financeiro" — `geraDuplicata` nulo
 * é o "não sei" que faz quem lê cair no critério antigo. Vazio (o ERP
 * manda o campo com espaços) é "não gerou".
 */
export function dadosDuplicata(duplicata: string | null | undefined) {
  if (duplicata === undefined) return {};
  const numero = duplicata?.trim() || null;
  return { duplicata: numero, geraDuplicata: numero !== null };
}
