import sanitizeHtml from 'sanitize-html';

/**
 * Sanitização do texto dos termos de uso **ao gravar** (SEC-10, relatório de
 * 27/10/2026).
 *
 * O navegador também sanitiza ao exibir (DOMPurify), mas quem guarda o texto é
 * a API: um cliente que chame a rota direto, ou outra tela que um dia exiba o
 * campo, não pode herdar um payload gravado. Mesma lista de permissão do
 * navegador (`apps/web/src/lib/termos-formatacao.ts`) — mantê-las iguais.
 *
 * Só sanitiza o que **parece HTML**. O termo também pode ser Markdown, e o
 * `sanitize-html` escaparia o `>` da citação e o `&` do texto, estragando o
 * documento; o Markdown é convertido e sanitizado de novo no navegador, antes
 * de ir para a tela.
 */
const TAGS_PERMITIDAS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'div', 'span',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
  'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

export function pareceHtml(texto: string): boolean {
  return /<[a-z][\s\S]*>/i.test(texto);
}

export function sanitizarTermos(texto: string): string {
  if (!texto || !pareceHtml(texto)) return texto;
  return sanitizeHtml(texto, {
    allowedTags: TAGS_PERMITIDAS,
    allowedAttributes: {
      a: ['href', 'rel'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
    },
    // Só estes esquemas em link: nada de `javascript:`, `data:` ou `vbscript:`.
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    // Tag fora da lista some com o que está dentro dela, e não só a tag:
    // `<script>` e `<style>` não deixam o conteúdo como texto.
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (tag, attribs) => {
        const novos: sanitizeHtml.Attributes = {};
        if (attribs.href) {
          novos.href = attribs.href;
          novos.rel = 'noopener noreferrer';
        }
        return { tagName: tag, attribs: novos };
      },
    },
  });
}
