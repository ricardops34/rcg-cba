"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * Cores do tema para bibliotecas de gráfico (hoje o Nivo, na Evolução de
 * Vendas). A animação do Nivo interpola cor, e ela não sabe interpolar
 * `var(--x)` nem oklch — por isso cada variável é resolvida para rgba aqui, e
 * recalculada quando o tema claro/escuro troca (classe do <html>).
 */

/**
 * Converte qualquer cor CSS (oklch, hex, nome...) para `rgba()` pintando um
 * pixel: é o jeito que funciona em todo navegador, inclusive para oklch.
 */
function paraRgb(cor: string, ctx: CanvasRenderingContext2D | null): string {
  if (!ctx || !cor) return cor;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = cor;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 100) / 100})`;
}

export interface TemaGrafico {
  /** Resolve `var(--x)` (ou uma cor CSS qualquer) para rgba. */
  cor: (valor: string) => string;
  texto: string;
  textoSuave: string;
  borda: string;
  superficie: string;
}

/** Avisa quando a classe/estilo do <html> muda (troca de tema claro/escuro). */
function assinarTema(avisar: () => void) {
  const observador = new MutationObserver(avisar);
  observador.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  return () => observador.disconnect();
}
const assinaturaTema = () =>
  `${document.documentElement.className}|${document.documentElement.getAttribute("style") ?? ""}`;

/** Cores do tema atual; `null` no servidor (o gráfico só monta no navegador). */
export function useTemaGrafico(): TemaGrafico | null {
  const assinatura = useSyncExternalStore(assinarTema, assinaturaTema, () => null);

  return useMemo(() => {
    if (assinatura === null) return null;
    const estilo = getComputedStyle(document.documentElement);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const cache = new Map<string, string>();
    const cor = (valor: string) => {
      const hit = cache.get(valor);
      if (hit) return hit;
      const variavel = /^var\((--[\w-]+)\)$/.exec(valor.trim());
      const bruto = variavel ? estilo.getPropertyValue(variavel[1]).trim() : valor;
      const rgb = paraRgb(bruto, ctx);
      cache.set(valor, rgb);
      return rgb;
    };
    return {
      cor,
      texto: cor("var(--foreground)"),
      textoSuave: cor("var(--muted-foreground)"),
      borda: cor("var(--border)"),
      superficie: cor("var(--card)"),
    };
  }, [assinatura]);
}

/** Tema do Nivo a partir das cores do sistema. O tooltip é desenhado por nós. */
export function temaNivo(tema: TemaGrafico) {
  return {
    text: { fill: tema.textoSuave, fontSize: 11, fontFamily: "inherit" },
    axis: {
      domain: { line: { stroke: tema.borda, strokeWidth: 1 } },
      ticks: {
        line: { stroke: tema.borda, strokeWidth: 1 },
        text: { fill: tema.textoSuave, fontSize: 11, fontFamily: "inherit" },
      },
    },
    grid: { line: { stroke: tema.borda, strokeWidth: 1, strokeDasharray: "4 4" } },
    crosshair: {
      line: { stroke: tema.textoSuave, strokeWidth: 1, strokeOpacity: 0.6, strokeDasharray: "4 4" },
    },
    labels: { text: { fill: tema.texto, fontSize: 11, fontWeight: 600, fontFamily: "inherit" } },
    tooltip: { container: { background: "transparent", padding: 0, boxShadow: "none" } },
  };
}
