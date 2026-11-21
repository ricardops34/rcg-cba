"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import type { BarSeriesOption, LineSeriesOption, PieSeriesOption } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import type {
  DataZoomComponentOption,
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
} from "echarts/components";
import { LabelLayout, UniversalTransition } from "echarts/features";
import { SVGRenderer } from "echarts/renderers";

/**
 * Base dos gráficos com Apache ECharts (Apache 2.0) — 20/11/2026, começando pela
 * Evolução de Vendas. Decisões que valem antes de mexer:
 *
 * - Import por partes (`echarts/core` + só os tipos usados): o pacote inteiro
 *   passa de 1 MB. Precisou de outro tipo? Registre aqui em `echarts.use`.
 * - Renderer SVG: texto nítido em qualquer zoom e menor que o canvas para o
 *   volume de pontos destas telas (dezenas, não milhares).
 * - Cores vêm das variáveis CSS do tema (--viz-N, --border, --foreground...).
 *   O ECharts não entende `var(...)` nem oklch, então `useTemaGrafico` resolve
 *   cada uma para rgb e recalcula quando o tema claro/escuro troca.
 * - Segurança: o tooltip do ECharts é HTML. Todo texto que vem de dado (nome
 *   de cliente, produto, categoria) passa por `escaparHtml` antes de entrar
 *   nele — nunca monte `formatter` concatenando texto cru.
 * - Animação: as trocas de forma (linha → barra, barra → rosca) usam o
 *   universalTransition. NÃO desligar por `prefers-reduced-motion`: o Windows
 *   liga esse sinal só por ter "Efeitos de animação" desligado, e os gráficos
 *   ficaram sem animação nenhuma (20/11/2026) — a animação é o motivo da escolha.
 */
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  LabelLayout,
  UniversalTransition,
  SVGRenderer,
]);

export type OpcaoGrafico = echarts.ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | PieSeriesOption
  | DataZoomComponentOption
  | GridComponentOption
  | LegendComponentOption
  | TooltipComponentOption
>;

/** Escapa texto para entrar no HTML do tooltip. */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
  /** Resolve `var(--x)` (ou uma cor CSS qualquer) para rgb. */
  cor: (valor: string) => string;
  texto: string;
  textoSuave: string;
  borda: string;
  superficie: string;
  popover: string;
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

/** Cores do tema atual, recalculadas quando a classe `dark` do <html> muda. */
export function useTemaGrafico(): TemaGrafico | null {
  // No servidor não há tema para ler: o gráfico só monta no navegador.
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
      popover: cor("var(--popover)"),
    };
  }, [assinatura]);
}

/** Estilo de tooltip comum: superfície e borda do tema, texto do sistema. */
export function tooltipBase(tema: TemaGrafico): TooltipComponentOption {
  return {
    backgroundColor: tema.popover,
    borderColor: tema.borda,
    borderWidth: 1,
    padding: [8, 12],
    confine: true,
    textStyle: { color: tema.texto, fontSize: 12, fontFamily: "inherit" },
    extraCssText: "box-shadow: 0 4px 12px rgba(0,0,0,.12); border-radius: 8px;",
  };
}

/**
 * Monta o gráfico num div e reaplica a opção quando ela muda. A opção é
 * sempre aplicada inteira (`notMerge`): é isso que deixa o universalTransition
 * animar a troca de forma em vez de misturar a forma velha com a nova.
 */
export function GraficoECharts({
  opcao,
  altura,
  rotulo,
  aoClicar,
}: {
  opcao: OpcaoGrafico | null;
  altura: number;
  /** Descrição para leitor de tela. */
  rotulo: string;
  aoClicar?: (parametros: { name?: string; seriesId?: string; dataIndex?: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const graficoRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const grafico = echarts.init(el, null, { renderer: "svg" });
    graficoRef.current = grafico;
    const observador = new ResizeObserver(() => grafico.resize());
    observador.observe(el);
    return () => {
      observador.disconnect();
      grafico.dispose();
      graficoRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (opcao) graficoRef.current?.setOption(opcao, { notMerge: true });
  }, [opcao]);

  useEffect(() => {
    const grafico = graficoRef.current;
    if (!grafico || !aoClicar) return;
    const handler = (p: unknown) => aoClicar(p as Parameters<typeof aoClicar>[0]);
    grafico.on("click", handler);
    return () => {
      grafico.off("click", handler);
    };
  }, [aoClicar]);

  return <div ref={ref} role="img" aria-label={rotulo} style={{ height: altura }} className="w-full" />;
}
