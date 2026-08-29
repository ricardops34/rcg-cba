/** Escapa texto nÃ£o confiÃ¡vel antes de interpolÃ¡-lo em HTML. */
export function escapeHtml(valor: string): string {
  return valor.replace(/[&<>'"]/g, (caractere) => {
    const entidades: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entidades[caractere];
  });
}
