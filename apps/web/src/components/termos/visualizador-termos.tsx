import React from "react";
import { cn } from "@/lib/utils";

interface VisualizadorTermosProps {
  conteudo: string | null | undefined;
  className?: string;
  placeholder?: string;
}

/** Formata trechos inline com negrito (**), itálico (*) e código (`). */
function formatarInline(texto: string): React.ReactNode {
  const partes = texto.split(/(\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|`[\s\S]*?`)/g);

  return partes.map((parte, i) => {
    if (parte.startsWith("**") && parte.endsWith("**") && parte.length >= 4) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {formatarInline(parte.slice(2, -2))}
        </strong>
      );
    }
    if (parte.startsWith("*") && parte.endsWith("*") && parte.length >= 2) {
      return (
        <em key={i} className="italic text-foreground">
          {parte.slice(1, -1)}
        </em>
      );
    }
    if (parte.startsWith("`") && parte.endsWith("`") && parte.length >= 2) {
      return (
        <code
          key={i}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary"
        >
          {parte.slice(1, -1)}
        </code>
      );
    }
    return parte;
  });
}

/**
 * Renderizador de Termos de Uso e documentos legais em Markdown formatado.
 * Suporta cabeçalhos (#, ##, ###), listas ordenadas/não-ordenadas, citações, divisores e negrito.
 * Renderização puramente em React sem dependências externas nem risco de XSS.
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

  const linhas = conteudo.replace(/\r\n/g, "\n").split("\n");
  const elementos: React.ReactNode[] = [];

  let itensLista: string[] = [];
  let tipoLista: "ul" | "ol" | null = null;
  let blocoCitacao: string[] = [];

  const descarregarLista = () => {
    if (!tipoLista || itensLista.length === 0) return;
    const chave = `lista-${elementos.length}`;
    if (tipoLista === "ul") {
      elementos.push(
        <ul
          key={chave}
          className="my-3 list-disc space-y-1.5 pl-6 text-sm text-foreground/90 marker:text-primary"
        >
          {itensLista.map((it, idx) => (
            <li key={idx} className="leading-relaxed">
              {formatarInline(it)}
            </li>
          ))}
        </ul>,
      );
    } else {
      elementos.push(
        <ol
          key={chave}
          className="my-3 list-decimal space-y-1.5 pl-6 text-sm text-foreground/90 marker:font-semibold marker:text-primary"
        >
          {itensLista.map((it, idx) => (
            <li key={idx} className="leading-relaxed">
              {formatarInline(it)}
            </li>
          ))}
        </ol>,
      );
    }
    itensLista = [];
    tipoLista = null;
  };

  const descarregarCitacao = () => {
    if (blocoCitacao.length === 0) return;
    const chave = `citacao-${elementos.length}`;
    elementos.push(
      <blockquote
        key={chave}
        className="my-3 rounded-r-md border-l-4 border-primary/50 bg-primary/5 px-4 py-2 text-sm italic text-foreground/80"
      >
        {blocoCitacao.map((c, idx) => (
          <p key={idx} className="leading-relaxed">
            {formatarInline(c)}
          </p>
        ))}
      </blockquote>,
    );
    blocoCitacao = [];
  };

  for (let idx = 0; idx < linhas.length; idx++) {
    const linha = linhas[idx].trim();

    // Linha vazia fecha listas ou citações abertas
    if (!linha) {
      descarregarLista();
      descarregarCitacao();
      continue;
    }

    // Divisor horizontal
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(linha)) {
      descarregarLista();
      descarregarCitacao();
      elementos.push(
        <hr key={`hr-${idx}`} className="my-5 border-border/80" />,
      );
      continue;
    }

    // Citação
    if (linha.startsWith(">")) {
      descarregarLista();
      blocoCitacao.push(linha.replace(/^>\s?/, ""));
      continue;
    } else {
      descarregarCitacao();
    }

    // Título H1
    if (linha.startsWith("# ")) {
      descarregarLista();
      elementos.push(
        <h1
          key={`h1-${idx}`}
          className="mt-6 mb-3 text-xl font-bold tracking-tight text-foreground sm:text-2xl first:mt-0"
        >
          {formatarInline(linha.slice(2))}
        </h1>,
      );
      continue;
    }

    // Título H2
    if (linha.startsWith("## ")) {
      descarregarLista();
      elementos.push(
        <h2
          key={`h2-${idx}`}
          className="mt-6 mb-2 border-b border-border/50 pb-1.5 text-lg font-semibold tracking-tight text-foreground sm:text-xl first:mt-0"
        >
          {formatarInline(linha.slice(3))}
        </h2>,
      );
      continue;
    }

    // Título H3
    if (linha.startsWith("### ")) {
      descarregarLista();
      elementos.push(
        <h3
          key={`h3-${idx}`}
          className="mt-4 mb-2 text-base font-semibold text-foreground first:mt-0"
        >
          {formatarInline(linha.slice(4))}
        </h3>,
      );
      continue;
    }

    // Título H4
    if (linha.startsWith("#### ")) {
      descarregarLista();
      elementos.push(
        <h4
          key={`h4-${idx}`}
          className="mt-3 mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground first:mt-0"
        >
          {formatarInline(linha.slice(5))}
        </h4>,
      );
      continue;
    }

    // Item de lista não-ordenada (- ou *)
    if (/^[-*]\s+/.test(linha)) {
      if (tipoLista && tipoLista !== "ul") descarregarLista();
      tipoLista = "ul";
      itensLista.push(linha.replace(/^[-*]\s+/, ""));
      continue;
    }

    // Item de lista ordenada (1. , 2. )
    if (/^\d+\.\s+/.test(linha)) {
      if (tipoLista && tipoLista !== "ol") descarregarLista();
      tipoLista = "ol";
      itensLista.push(linha.replace(/^\d+\.\s+/, ""));
      continue;
    }

    // Linha de texto comum (parágrafo)
    descarregarLista();
    elementos.push(
      <p
        key={`p-${idx}`}
        className="my-2.5 text-sm leading-relaxed text-foreground/90 first:mt-0 last:mb-0"
      >
        {formatarInline(linha)}
      </p>,
    );
  }

  // Descarrega o que sobrou no final
  descarregarLista();
  descarregarCitacao();

  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none text-foreground select-text",
        className,
      )}
    >
      {elementos}
    </div>
  );
}

