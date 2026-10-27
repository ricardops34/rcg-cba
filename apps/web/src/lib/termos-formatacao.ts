import DOMPurify from "dompurify";

/**
 * Utilitários para formatação, conversão e sanitização de documentos ricos de Termos de Uso.
 */

/** Converte texto Markdown para HTML limpo compatível com o editor visual. */
export function markdownParaHtml(markdown: string): string {
  if (!markdown || !markdown.trim()) return "";

  // Se já for HTML com tags conhecidas, retorna direto
  if (/<(h[1-6]|p|ul|ol|li|blockquote|strong|b|em|i|u|div)\b/i.test(markdown)) {
    return sanitizarHtml(markdown);
  }

  const linhas = markdown.replace(/\r\n/g, "\n").split("\n");
  const saida: string[] = [];

  let listaTipo: "ul" | "ol" | null = null;
  let listaItens: string[] = [];
  let blocoCitacao: string[] = [];

  const fecharLista = () => {
    if (!listaTipo || listaItens.length === 0) return;
    const tag = listaTipo;
    const itens = listaItens.map((it) => `<li>${it}</li>`).join("");
    saida.push(`<${tag}>${itens}</${tag}>`);
    listaTipo = null;
    listaItens = [];
  };

  const fecharCitacao = () => {
    if (blocoCitacao.length === 0) return;
    saida.push(`<blockquote>${blocoCitacao.join("<br />")}</blockquote>`);
    blocoCitacao = [];
  };

  const formatarInline = (texto: string) => {
    return texto
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  };

  for (const l of linhas) {
    const linha = l.trim();

    if (!linha) {
      fecharLista();
      fecharCitacao();
      continue;
    }

    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(linha)) {
      fecharLista();
      fecharCitacao();
      saida.push("<hr />");
      continue;
    }

    if (linha.startsWith(">")) {
      fecharLista();
      blocoCitacao.push(formatarInline(linha.replace(/^>\s?/, "")));
      continue;
    } else {
      fecharCitacao();
    }

    if (linha.startsWith("# ")) {
      fecharLista();
      saida.push(`<h1>${formatarInline(linha.slice(2))}</h1>`);
      continue;
    }

    if (linha.startsWith("## ")) {
      fecharLista();
      saida.push(`<h2>${formatarInline(linha.slice(3))}</h2>`);
      continue;
    }

    if (linha.startsWith("### ")) {
      fecharLista();
      saida.push(`<h3>${formatarInline(linha.slice(4))}</h3>`);
      continue;
    }

    if (linha.startsWith("#### ")) {
      fecharLista();
      saida.push(`<h4>${formatarInline(linha.slice(5))}</h4>`);
      continue;
    }

    if (/^[-*]\s+/.test(linha)) {
      if (listaTipo && listaTipo !== "ul") fecharLista();
      listaTipo = "ul";
      listaItens.push(formatarInline(linha.replace(/^[-*]\s+/, "")));
      continue;
    }

    if (/^\d+\.\s+/.test(linha)) {
      if (listaTipo && listaTipo !== "ol") fecharLista();
      listaTipo = "ol";
      listaItens.push(formatarInline(linha.replace(/^\d+\.\s+/, "")));
      continue;
    }

    fecharLista();
    saida.push(`<p>${formatarInline(linha)}</p>`);
  }

  fecharLista();
  fecharCitacao();

  return saida.join("");
}

/**
 * Tags e atributos que um termo de uso precisa — e só eles.
 *
 * Lista de **permissão**, aplicada pelo DOMPurify. A versão anterior era uma
 * lista de bloqueio por regex (tirava `<script>`, ` on…=`, `javascript:`) e
 * deixava passar `<svg/onload=…>`, manipulador de evento sem espaço antes, e
 * `href` com entidade HTML — XSS armazenado, já que o texto é gravado como veio
 * e exibido com `dangerouslySetInnerHTML`.
 */
const TAGS_PERMITIDAS = [
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "div", "span",
  "ul", "ol", "li", "blockquote", "pre", "code",
  "strong", "b", "em", "i", "u", "s", "sub", "sup",
  "a", "table", "thead", "tbody", "tr", "th", "td",
];
const ATRIBUTOS_PERMITIDOS = ["href", "target", "rel", "colspan", "rowspan"];
/** Só estes esquemas em link: nada de `javascript:`, `data:` ou `vbscript:`, com ou sem entidade. */
const ESQUEMAS_PERMITIDOS = /^(?:https?:|mailto:|tel:|#)/i;

let ganchoDeLinks = false;

export function sanitizarHtml(html: string): string {
  if (!html) return "";
  // Sem DOM (render no servidor) o DOMPurify não consegue limpar e devolveria o
  // texto como veio: nesse caso escapa tudo, que é seguro, em vez de arriscar.
  if (typeof window === "undefined" || !DOMPurify.isSupported) {
    return html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  if (!ganchoDeLinks) {
    // Link que abre em outra aba não deixa a página de origem à mercê dela.
    DOMPurify.addHook("afterSanitizeAttributes", (no) => {
      if (no.tagName === "A") {
        if (no.getAttribute("target")) no.setAttribute("rel", "noopener noreferrer");
        else no.removeAttribute("rel");
      }
    });
    ganchoDeLinks = true;
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: TAGS_PERMITIDAS,
    ALLOWED_ATTR: ATRIBUTOS_PERMITIDOS,
    ALLOWED_URI_REGEXP: ESQUEMAS_PERMITIDOS,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}

/** Extrai texto plano sem tags para contagem de palavras e caracteres. */
export function htmlParaTextoPlano(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Verifica se a string contém tags HTML. */
export function ehHtml(texto: string): boolean {
  return /<[a-z][\s\S]*>/i.test(texto);
}

