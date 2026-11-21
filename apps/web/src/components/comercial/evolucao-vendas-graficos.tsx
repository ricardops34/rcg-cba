"use client";

import { useMemo } from "react";
import type { PieSeriesOption } from "echarts/charts";
import type {
  SerieEvolucao,
  TipoGraficoEvolucao,
} from "@/components/consultas/grafico-evolucao";
import {
  GraficoECharts,
  escaparHtml,
  tooltipBase,
  useTemaGrafico,
  type OpcaoGrafico,
} from "@/components/graficos/echarts";

/**
 * Gráficos da Comercial > Evolução de Vendas em ECharts (20/11/2026). As
 * Consultas seguem no SVG próprio (consultas/grafico-evolucao.tsx) até a
 * decisão de migrar; os tipos de série e de forma são os mesmos de lá.
 *
 * Visual no estilo dos exemplos do ECharts (pedido do usuário): linhas
 * suavizadas com degradê embaixo, pontos, barras crescendo em sequência,
 * zoom no período e rosca com rótulos. Ficam do gráfico antigo: cor presa à
 * entidade (--viz-N na ordem do chamador, "Outros" em cinza), legenda com
 * nome, total no tooltip das formas empilhadas e a tabela da aba Dados
 * repetindo todos os números.
 */

const moedaCheia = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const moedaCompacta = (v: number) =>
  v.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const pct = (parte: number, total: number) =>
  total
    ? `${((parte / total) * 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%`
    : "—";

/** Troca a opacidade de uma cor `rgba(r, g, b, a)` já resolvida pelo tema. */
function comAlfa(rgba: string, alfa: number) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgba);
  return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alfa})` : rgba;
}

/** Degradê vertical: cor cheia em cima, `fim` de opacidade embaixo. */
function degrade(cor: string, inicio: number, fim: number) {
  return {
    type: "linear" as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: comAlfa(cor, inicio) },
      { offset: 1, color: comAlfa(cor, fim) },
    ],
  };
}

/** Acima disso o rótulo na ponta da linha se atropela — fica só a legenda. */
const MAX_SERIES_COM_ROTULO = 4;
/** A partir daqui aparece a régua de zoom do período. */
const MESES_COM_ZOOM = 7;

/** Uma linha do tooltip: bolinha na cor da série, nome escapado e valor. */
function linhaTooltip(cor: string, nome: string, valor: string, negrito = false) {
  return (
    `<div style="display:flex;align-items:center;gap:8px;min-width:180px;${negrito ? "font-weight:600;" : ""}">` +
    (cor
      ? `<span style="width:8px;height:8px;border-radius:50%;background:${cor};flex-shrink:0"></span>`
      : "") +
    `<span style="opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px">${escaparHtml(nome)}</span>` +
    `<span style="margin-left:auto;font-variant-numeric:tabular-nums">${valor}</span></div>`
  );
}

export function GraficoEvolucaoMensal({
  meses,
  series,
  tipo,
}: {
  meses: string[];
  series: SerieEvolucao[];
  tipo: TipoGraficoEvolucao;
}) {
  const tema = useTemaGrafico();
  const comZoom = meses.length >= MESES_COM_ZOOM;

  const opcao = useMemo<OpcaoGrafico | null>(() => {
    if (!tema) return null;
    const emBarras = tipo === "barra" || tipo === "empilhada";
    const empilhado = tipo === "area" || tipo === "empilhada";
    const comRotulo = tipo === "linha" && series.length <= MAX_SERIES_COM_ROTULO;
    const eixo = { color: tema.textoSuave, fontSize: 11 };
    const legenda = series.length > 1;

    return {
      animation: true,
      animationDuration: 1200,
      animationEasing: "cubicOut",
      animationDurationUpdate: 800,
      animationEasingUpdate: "cubicInOut",
      grid: {
        top: 24,
        left: 8,
        right: comRotulo ? 72 : 16,
        bottom: (legenda ? 36 : 8) + (comZoom ? 36 : 0),
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: meses,
        boundaryGap: emBarras,
        axisLine: { lineStyle: { color: tema.borda } },
        axisTick: { show: false },
        axisLabel: { ...eixo, hideOverlap: true, margin: 12 },
      },
      yAxis: {
        type: "value",
        axisLabel: { ...eixo, formatter: (v: number) => moedaCompacta(v) },
        splitLine: { lineStyle: { color: tema.borda, type: "dashed" } },
      },
      dataZoom: comZoom
        ? [
            { type: "inside", start: 0, end: 100 },
            {
              type: "slider",
              bottom: legenda ? 36 : 4,
              height: 22,
              borderColor: tema.borda,
              textStyle: { color: tema.textoSuave, fontSize: 10 },
              fillerColor: comAlfa(tema.cor("var(--viz-1)"), 0.15),
              handleStyle: { color: tema.superficie, borderColor: tema.textoSuave },
              dataBackground: {
                lineStyle: { color: tema.textoSuave, opacity: 0.4 },
                areaStyle: { color: tema.textoSuave, opacity: 0.1 },
              },
            },
          ]
        : [],
      legend: {
        show: legenda,
        type: "scroll",
        bottom: 0,
        icon: tipo === "linha" ? "roundRect" : "circle",
        itemWidth: tipo === "linha" ? 16 : 10,
        itemHeight: tipo === "linha" ? 4 : 10,
        itemGap: 16,
        textStyle: { color: tema.textoSuave, fontSize: 12 },
        pageTextStyle: { color: tema.textoSuave },
        inactiveColor: tema.borda,
      },
      tooltip: {
        ...tooltipBase(tema),
        trigger: "axis",
        axisPointer: emBarras
          ? { type: "shadow", shadowStyle: { color: comAlfa(tema.textoSuave, 0.08) } }
          : {
              type: "cross",
              label: { backgroundColor: tema.textoSuave },
              lineStyle: { color: tema.textoSuave, type: "dashed" },
              crossStyle: { color: tema.textoSuave },
            },
        formatter: (params) => {
          const itens = (Array.isArray(params) ? params : [params]) as {
            seriesName?: string;
            value?: unknown;
            color?: unknown;
            name?: string;
          }[];
          if (!itens.length) return "";
          const mes = escaparHtml(String(itens[0].name ?? ""));
          const ordenados = [...itens].sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0));
          const total = itens.reduce((a, p) => a + Number(p.value ?? 0), 0);
          const corDe = (c: unknown) =>
            typeof c === "string"
              ? c
              : // Degradê: a bolinha usa a cor do topo.
                ((c as { colorStops?: { color: string }[] })?.colorStops?.[0]?.color ?? "");
          return (
            `<div style="font-weight:600;margin-bottom:4px">${mes}</div>` +
            ordenados
              .map((p) =>
                linhaTooltip(corDe(p.color), String(p.seriesName ?? ""), moedaCheia(Number(p.value ?? 0))),
              )
              .join("") +
            (empilhado && itens.length > 1
              ? `<div style="border-top:1px solid ${tema.borda};margin-top:4px;padding-top:4px">${linhaTooltip("", "Total", moedaCheia(total), true)}</div>`
              : "")
          );
        },
      },
      series: series.map((s, i) => {
        const cor = tema.cor(s.cor);
        const comum = {
          id: s.id,
          name: s.nome,
          data: s.valores,
          color: cor,
          universalTransition: { enabled: true },
          emphasis: { focus: "series" as const },
        };
        if (emBarras) {
          const doTopo = tipo === "barra" || i === series.length - 1;
          return {
            ...comum,
            type: "bar" as const,
            stack: tipo === "empilhada" ? "total" : undefined,
            barMaxWidth: tipo === "barra" ? 28 : 40,
            barGap: "10%",
            itemStyle: {
              color: degrade(cor, 1, 0.65),
              borderRadius: doTopo ? [6, 6, 0, 0] : 0,
            },
            emphasis: {
              focus: "series" as const,
              itemStyle: { shadowBlur: 12, shadowColor: comAlfa(cor, 0.5) },
            },
            // Barras nascem em sequência: mês a mês, série a série.
            animationDelay: (idx: number) => idx * 60 + i * 120,
            animationDelayUpdate: (idx: number) => idx * 20,
          };
        }
        return {
          ...comum,
          type: "line" as const,
          stack: tipo === "area" ? "total" : undefined,
          smooth: 0.35,
          symbol: "circle",
          symbolSize: 8,
          showSymbol: meses.length <= 12,
          lineStyle: {
            width: tipo === "area" ? 2 : 3,
            color: cor,
            shadowBlur: tipo === "linha" ? 8 : 0,
            shadowColor: comAlfa(cor, 0.35),
            shadowOffsetY: 4,
          },
          itemStyle: { color: cor, borderColor: tema.superficie, borderWidth: 2 },
          // Linha: véu em degradê; área empilhada: faixa quase cheia.
          areaStyle:
            tipo === "area"
              ? { color: degrade(cor, 0.85, 0.45) }
              : series.length <= 3
                ? { color: degrade(cor, 0.28, 0) }
                : undefined,
          emphasis: { focus: "series" as const, scale: 1.6 },
          endLabel: comRotulo
            ? {
                show: true,
                color: tema.texto,
                fontSize: 11,
                fontWeight: 600,
                formatter: (p: { value?: unknown }) => moedaCompacta(Number(p.value ?? 0)),
              }
            : undefined,
        };
      }),
    } satisfies OpcaoGrafico;
  }, [tema, meses, series, tipo, comZoom]);

  return (
    <GraficoECharts
      opcao={opcao}
      altura={360 + (series.length > 1 ? 32 : 0) + (comZoom ? 36 : 0)}
      rotulo={`Venda por mês, de ${meses[0] ?? "—"} a ${meses[meses.length - 1] ?? "—"}`}
    />
  );
}

export type FormaParticipacao = "barras" | "rosca";

export interface ItemParticipacao {
  id: string;
  nome: string;
  valor: number;
  /** Mesma cor da série no gráfico mensal. */
  cor: string;
}

export function GraficoParticipacao({
  itens,
  total,
  forma,
}: {
  itens: ItemParticipacao[];
  total: number;
  forma: FormaParticipacao;
}) {
  const tema = useTemaGrafico();

  const opcao = useMemo<OpcaoGrafico | null>(() => {
    if (!tema) return null;
    const dados = itens.map((it) => {
      const cor = tema.cor(it.cor);
      return {
        id: it.id,
        name: it.nome,
        value: it.valor,
        itemStyle: {
          color:
            forma === "barras"
              ? {
                  type: "linear" as const,
                  x: 0,
                  y: 0,
                  x2: 1,
                  y2: 0,
                  colorStops: [
                    { offset: 0, color: comAlfa(cor, 0.7) },
                    { offset: 1, color: cor },
                  ],
                }
              : cor,
        },
      };
    });
    const tooltip = {
      ...tooltipBase(tema),
      trigger: "item" as const,
      formatter: (p: unknown) => {
        const { name, value, dataIndex } = p as { name?: string; value?: unknown; dataIndex?: number };
        const v = Number(value ?? 0);
        const cor = dataIndex != null && itens[dataIndex] ? tema.cor(itens[dataIndex].cor) : "";
        return linhaTooltip(cor, String(name ?? ""), `${moedaCheia(v)} · ${pct(v, total)}`);
      },
    };
    const comum = {
      id: "participacao",
      name: "Participação",
      data: dados,
      universalTransition: { enabled: true },
      animationDuration: 1000,
      animationEasing: "cubicOut" as const,
    };

    if (forma === "rosca") {
      return {
        animation: true,
        animationDurationUpdate: 900,
        animationEasingUpdate: "cubicInOut",
        tooltip,
        series: [
          {
            ...comum,
            type: "pie" as const,
            radius: ["42%", "68%"],
            center: ["50%", "50%"],
            padAngle: 2,
            animationType: "expansion",
            itemStyle: { borderRadius: 6, borderColor: tema.superficie, borderWidth: 2 },
            label: {
              show: true,
              color: tema.textoSuave,
              fontSize: 11,
              width: 90,
              overflow: "truncate",
              formatter: (p: { name?: string; percent?: number }) =>
                `${p.name ?? ""}\n{pct|${(p.percent ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%}`,
              rich: { pct: { color: tema.texto, fontSize: 12, fontWeight: 600, lineHeight: 18 } },
            },
            labelLine: { length: 8, length2: 10, smooth: true, lineStyle: { color: tema.borda } },
            labelLayout: { hideOverlap: true },
            emphasis: {
              scale: true,
              scaleSize: 8,
              itemStyle: { shadowBlur: 16, shadowColor: "rgba(0,0,0,.25)" },
            },
          } as PieSeriesOption,
          // Total no miolo da rosca (série só de rótulo, sem interação).
          {
            type: "pie",
            radius: [0, "38%"],
            silent: true,
            data: [{ value: 1, name: "Total", itemStyle: { color: "transparent" } }],
            label: {
              show: true,
              position: "center",
              formatter: () => `{v|${moedaCompacta(total)}}\n{r|Total}`,
              rich: {
                v: { color: tema.texto, fontSize: 18, fontWeight: 700, lineHeight: 24 },
                r: { color: tema.textoSuave, fontSize: 11 },
              },
            },
            labelLine: { show: false },
            tooltip: { show: false },
          } as PieSeriesOption,
        ],
      } satisfies OpcaoGrafico;
    }

    return {
      animation: true,
      animationDurationUpdate: 900,
      animationEasingUpdate: "cubicInOut",
      tooltip,
      grid: { top: 4, left: 4, right: 52, bottom: 4, containLabel: true },
      xAxis: { type: "value", show: false, max: Math.max(...itens.map((i) => i.valor), 0) || 1 },
      yAxis: {
        type: "category",
        inverse: true,
        data: itens.map((i) => i.nome),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: tema.textoSuave, fontSize: 11, width: 120, overflow: "truncate" },
      },
      series: [
        {
          ...comum,
          type: "bar",
          barMaxWidth: 18,
          showBackground: true,
          backgroundStyle: { color: comAlfa(tema.textoSuave, 0.08), borderRadius: 9 },
          itemStyle: { borderRadius: 9 },
          animationDelay: (idx: number) => idx * 90,
          label: {
            show: true,
            position: "right",
            color: tema.texto,
            fontSize: 11,
            fontWeight: 600,
            formatter: (p: { value?: unknown }) => pct(Number(p.value ?? 0), total),
          },
        },
      ],
    } satisfies OpcaoGrafico;
  }, [tema, itens, total, forma]);

  return (
    <GraficoECharts
      opcao={opcao}
      altura={forma === "rosca" ? 320 : Math.max(180, itens.length * 38 + 16)}
      rotulo="Participação de cada um no total do período"
    />
  );
}
