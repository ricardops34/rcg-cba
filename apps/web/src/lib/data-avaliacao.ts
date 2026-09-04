/**
 * Conversão entre o `input[type=date]` e o ISO do prazo de avaliação.
 *
 * Fica num lugar só porque a regra do fim do dia é sutil e três telas mexem
 * nela (o diálogo da lista do SaaS, o cadastro de empresa nova e o formulário
 * de empresa). Cópias divergentes aqui não dariam erro de compilação — dariam
 * um acesso cortado um dia antes, que ninguém liga ao código.
 */

/** ISO → "yyyy-MM-dd" que o input entende, no fuso local. */
export function paraCampoData(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * "yyyy-MM-dd" → ISO no **fim** do dia escolhido.
 *
 * Quem digita 30/09 quer o teste valendo o dia 30 inteiro. Converter para
 * meia-noite cortaria o acesso na virada do 29 para o 30 — um dia antes do que
 * a tela promete, e a pessoa reclamaria de um bloqueio "fora da data".
 */
export function paraIsoFimDoDia(valor: string): string | null {
  if (!valor) return null;
  const [ano, mes, dia] = valor.split("-").map(Number);
  return new Date(ano, mes - 1, dia, 23, 59, 59, 999).toISOString();
}

/** Soma dias a hoje e devolve no formato do input. Usado nos atalhos de teste. */
export function dataEmDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}
