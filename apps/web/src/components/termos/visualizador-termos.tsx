"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ehHtml, markdownParaHtml, sanitizarHtml } from "@/lib/termos-formatacao";

interface VisualizadorTermosProps {
  conteudo: string | null | undefined;
  className?: string;
  placeholder?: string;
}

/**
 * Renderizador de Termos de Uso e documentos legais.
 * Suporta tanto HTML formatado visualmente (WYSIWYG) quanto Markdown tradicional.
 * Sanitiza o conteúdo para prevenir vulnerabilidades XSS e aplica tipografia consistente.
 */
export function VisualizadorTermos({
  conteudo,
  className,
  placeholder = "Nenhum conteúdo definido para estes termos de uso.",
}: VisualizadorTermosProps) {
  if (!conteudo || !conteudo.trim()) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground bg-muted/20",
          className,
        )}
      >
        <p>{placeholder}</p>
      </div>
    );
  }

  // Se já for HTML, sanitiza; se for Markdown, converte para HTML sanitizado
  const htmlFinal = ehHtml(conteudo)
    ? sanitizarHtml(conteudo)
    : sanitizarHtml(markdownParaHtml(conteudo));

  return (
    <div
      className={cn(
        "select-text text-foreground text-sm leading-relaxed",
        "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-foreground [&_h1]:mb-3 [&_h1]:mt-6 [&_h1:first-child]:mt-0",
        "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h2]:border-b [&_h2]:border-border/50 [&_h2]:pb-1.5 [&_h2]:mb-2 [&_h2]:mt-6 [&_h2:first-child]:mt-0",
        "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mb-2 [&_h3]:mt-4 [&_h3:first-child]:mt-0",
        "[&_h4]:text-sm [&_h4]:font-semibold [&_h4]:uppercase [&_h4]:tracking-wider [&_h4]:text-muted-foreground [&_h4]:mb-1 [&_h4]:mt-3",
        "[&_p]:my-2.5 [&_p]:text-foreground/90 [&_p]:leading-relaxed",
        "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-3 [&_ul]:space-y-1.5 [&_ul]:text-foreground/90 [&_ul_li]:marker:text-primary",
        "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-3 [&_ol]:space-y-1.5 [&_ol]:text-foreground/90 [&_ol_li]:marker:font-semibold [&_ol_li]:marker:text-primary",
        "[&_li]:leading-relaxed",
        "[&_blockquote]:border-l-4 [&_blockquote]:border-primary/50 [&_blockquote]:bg-primary/5 [&_blockquote]:px-4 [&_blockquote]:py-2 [&_blockquote]:my-3 [&_blockquote]:italic [&_blockquote]:text-foreground/80 [&_blockquote]:rounded-r-md",
        "[&_hr]:my-5 [&_hr]:border-border/80",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_em]:italic [&_em]:text-foreground",
        "[&_u]:underline",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-primary",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: htmlFinal }}
    />
  );
}
