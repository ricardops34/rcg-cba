"use client";

import { useMemo } from "react";
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
 * Mantém as regras do gráfico antigo: cor presa à entidade (--viz-N na ordem
 * que o chamador atribui, "Outros" em cinza), legenda sempre com nome, texto
 * na cor do tema e nunca na cor da série, total no tooltip das formas
 * empilhadas, e a tabela da aba Dados repetindo todos os números.
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

/** Acima disso o rótulo na ponta da linha se atropela — fica só a legenda. */
const MAX_SERIES_COM_ROTULO = 4;

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

  const opcao = useMemo<OpcaoGrafico | null>(() => {
    if (!tema) return null;
    const emBarras = tipo === "barra" || tipo === "empilhada";
    const empilhado = tipo === "area" || tipo === "empilhada";
    const comRotulo = tipo === "linha" && series.length <= MAX_SERIES_COM_ROTULO;
    const eixo = { color: tema.textoSuave, fontSize: 11 };

    return {
      animation: !tema.semAnimacao,
      animationDurationUpdate: 700,
      grid: { top: 16, left: 8, right: comRotulo ? 72 : 16, bottom: series.length > 1 ? 48 : 8, containLabel: true },
      xAxis: {
        type: "category",
        data: meses,
        boundaryGap: emBarras,
        axisLine: { lineStyle: { color: tema.borda } },
        axisTick: { show: false },
        axisLabel: { ...eixo, hideOverlap: true },
      },
      yAxis: {
        type: "value",
        axisLabel: { ...eixo, formatter: (v: number) => moedaCompacta(v) },
        splitLine: { lineStyle: { color: tema.borda } },
      },
      legend: {
        show: series.length > 1,
        type: "scroll",
        bottom: 0,
        icon: tipo === "linha" ? "roundRect" : "circle",
        itemWidth: tipo === "linha" ? 16 : 10,
        itemHeight: tipo === "linha" ? 3 : 10,
        textStyle: { color: tema.textoSuave, fontSize: 12 },
        pageTextStyle: { color: tema.textoSuave },
        inactiveColor: tema.borda,
      },
      tooltip: {
        ...tooltipBase(tema),
        trigger: "axis",
        axisPointer: emBarras
          ? { type: "shadow", shadowStyle: { color: tema.borda } }
          : { type: "line", lineStyle: { color: tema.borda } },
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
          return (
            `<div style="font-weight:600;margin-bottom:4px">${mes}</div>` +
            ordenados
              .map((p) =>
                linhaTooltip(
                  typeof p.color === "string" ? p.color : "",
                  String(p.seriesName ?? ""),
                  moedaCheia(Number(p.value ?? 0)),
                ),
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
            barMaxWidth: tipo === "barra" ? 24 : 36,
            barGap: "8%",
            itemStyle: {
              color: cor,
              borderRadius: doTopo ? [4, 4, 0, 0] : 0,
              // Vão na cor da superfície entre segmentos da pilha.
              borderColor: tipo === "empilhada" ? tema.superficie : undefined,
              borderWidth: tipo === "empilhada" ? 1 : 0,
            },
          };
        }
        return {
          ...comum,
          type: "line" as const,
          stack: tipo === "area" ? "total" : undefined,
          symbol: "circle",
          symbolSize: 7,
          showSymbol: tipo === "linha" && meses.length <= 12,
          lineStyle: { width: tipo === "area" ? 1 : 2, color: tipo === "area" ? tema.superficie : cor },
          itemStyle: { color: cor, borderColor: tema.superficie, borderWidth: 2 },
          areaStyle: tipo === "area" ? { color: cor, opacity: 0.9 } : undefined,
          endLabel: comRotulo
            ? {
                show: true,
                color: tema.texto,
                fontSize: 11,
                formatter: (p: { value?: unknown }) => moedaCompacta(Number(p.value ?? 0)),
              }
            : undefined,
        };
      }),
    } satisfies OpcaoGrafico;
  }, [tema, meses, series, tipo]);

  return (
    <GraficoECharts
      opcao={opcao}
      altura={series.length > 1 ? 380 : 340}
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
    const dados = itens.map((it) => ({
      id: it.id,
      name: it.nome,
      value: it.valor,
      itemStyle: { color: tema.cor(it.cor) },
    }));
    const tooltip = {
      ...tooltipBase(tema),
      trigger: "item" as const,
      formatter: (p: unknown) => {
        const { name, value, color } = p as { name?: string; value?: unknown; color?: unknown };
        const v = Number(value ?? 0);
        return linhaTooltip(
          typeof color === "string" ? color : "",
          String(name ?? ""),
          `${moedaCheia(v)} · ${pct(v, total)}`,
        );
      },
    };
    const comum = {
      id: "participacao",
      name: "Participação",
      data: dados,
      universalTransition: { enabled: true },
    };

    if (forma === "rosca") {
      return {
        animation: !tema.semAnimacao,
        animationDurationUpdate: 800,
        tooltip,
        series: [
          {
            ...comum,
            type: "pie",
            radius: ["50%", "78%"],
            center: ["50%", "50%"],
            padAngle: 1,
            itemStyle: { borderRadius: 4, borderColor: tema.superficie, borderWidth: 2 },
            label: {
              show: true,
              position: "center",
              formatter: () => `{total|${moedaCompacta(total)}}\n{rotulo|Total}`,
              rich: {
                total: { color: tema.texto, fontSize: 16, fontWeight: 600, lineHeight: 22 },
                rotulo: { color: tema.textoSuave, fontSize: 11 },
              },
            },
            labelLine: { show: false },
            emphasis: { scale: true, scaleSize: 6, label: { show: true } },
          },
        ],
      } satisfies OpcaoGrafico;
    }

    return {
      animation: !tema.semAnimacao,
      animationDurationUpdate: 800,
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
          barMaxWidth: 16,
          showBackground: true,
          backgroundStyle: { color: tema.borda, borderRadius: 4 },
          itemStyle: { borderRadius: 4 },
          label: {
            show: true,
            position: "right",
            color: tema.textoSuave,
            fontSize: 11,
            formatter: (p: { value?: unknown }) => pct(Number(p.value ?? 0), total),
          },
        },
      ],
    } satisfies OpcaoGrafico;
  }, [tema, itens, total, forma]);

  return (
    <GraficoECharts
      opcao={opcao}
      altura={forma === "rosca" ? 300 : Math.max(160, itens.length * 34 + 16)}
      rotulo="Participação de cada um no total do período"
    />
  );
}
