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
 * Sanitiza HTML para permitir apenas marcações de texto e estrutura seguras,
 * removendo scripts, iframes e atributos perigosos (XSS protection).
 */
export function sanitizarHtml(html: string): string {
  if (!html) return "";

  // Remove tags perigosas
  let limpo = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // Remove manipuladores de evento perigosos (ex: onclick, onload, onerror)
  limpo = limpo.replace(/\son\w+="[^"]*"/gi, "");
  limpo = limpo.replace(/\son\w+='[^']*'/gi, "");
  limpo = limpo.replace(/\son\w+=\S+/gi, "");

  // Remove esquemas javascript: em links
  limpo = limpo.replace(/href=["']?javascript:[^"'>]+["']?/gi, 'href="#"');

  return limpo;
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

