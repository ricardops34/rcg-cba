"use client";

import { useMemo } from "react";
import { ResponsiveBar, type BarDatum } from "@nivo/bar";
import { ResponsivePie } from "@nivo/pie";
import { temaNivo, useTemaGrafico } from "@/components/graficos/tema-grafico";
import { CaixaTooltip, LinhaTooltip, MOLA_GRAFICO } from "@/components/graficos/tooltip-grafico";

/**
 * Participação de cada item no total, com Nivo (MIT): barras horizontais com o
 * % ao lado, ou rosca com o total no miolo e a lista embaixo. A rosca abre
 * girando e as barras crescem ao montar. Usado na Evolução de Vendas (mesmas
 * séries e cores do gráfico mensal), no SMS (por motivo) e em Acessos (uso por
 * rotina). Cada item traz a própria cor (`var(--viz-N)` ou outra variável).
 */

/** Valor cheio (tooltip) e compacto (miolo da rosca) para cada formato. */
const FORMATOS = {
  moeda: {
    cheio: (v: number) =>
      v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }),
    compacto: (v: number) =>
      v.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 }),
  },
  quantidade: {
    cheio: (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }),
    compacto: (v: number) =>
      v.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 }),
  },
};
const pct = (parte: number, total: number) =>
  total
    ? `${((parte / total) * 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%`
    : "—";
const truncar = (texto: string, max: number) =>
  texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;

export type FormaParticipacao = "barras" | "rosca";

export interface ItemParticipacao {
  id: string;
  nome: string;
  valor: number;
  /** Cor CSS do item, ex.: "var(--viz-1)". */
  cor: string;
}

export function GraficoParticipacao({
  itens,
  total,
  forma,
  formato = "moeda",
  rotulo = "Participação de cada um no total do período",
  rotuloTotal = "Total",
}: {
  itens: ItemParticipacao[];
  total: number;
  forma: FormaParticipacao;
  formato?: "moeda" | "quantidade";
  /** Descrição para leitor de tela. */
  rotulo?: string;
  /** Legenda do número no miolo da rosca. */
  rotuloTotal?: string;
}) {
  const { cheio, compacto } = FORMATOS[formato];
  const tema = useTemaGrafico();
  const porId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);

  if (!tema) return <div style={{ height: 280 }} />;
  const temaGrafico = temaNivo(tema);
  const corDe = (id: string | number) => tema.cor(porId.get(String(id))?.cor ?? "");

  if (forma === "rosca") {
    return (
      <div className="space-y-3">
        <div style={{ height: 260 }} role="img" aria-label={rotulo}>
          <ResponsivePie
            data={itens.map((i) => ({ id: i.id, label: i.nome, value: i.valor }))}
            margin={{ top: 12, right: 12, bottom: 12, left: 12 }}
            innerRadius={0.6}
            padAngle={1.5}
            cornerRadius={4}
            activeOuterRadiusOffset={8}
            colors={(d) => corDe(d.id)}
            borderWidth={0}
            enableArcLinkLabels={false}
            arcLabel={(d) => pct(d.value, total)}
            arcLabelsSkipAngle={18}
            arcLabelsTextColor="#ffffff"
            theme={temaGrafico}
            motionConfig={MOLA_GRAFICO}
            transitionMode="startAngle"
            tooltip={({ datum }) => (
              <CaixaTooltip>
                <LinhaTooltip
                  cor={datum.color}
                  nome={String(datum.label)}
                  valor={`${cheio(datum.value)} · ${pct(datum.value, total)}`}
                />
              </CaixaTooltip>
            )}
            layers={[
              "arcs",
              "arcLabels",
              ({ centerX, centerY }) => (
                <g>
                  <text
                    x={centerX}
                    y={centerY - 4}
                    textAnchor="middle"
                    style={{ fill: tema.texto, fontSize: 17, fontWeight: 700 }}
                  >
                    {compacto(total)}
                  </text>
                  <text
                    x={centerX}
                    y={centerY + 14}
                    textAnchor="middle"
                    style={{ fill: tema.textoSuave, fontSize: 11 }}
                  >
                    {rotuloTotal}
                  </text>
                </g>
              ),
            ]}
          />
        </div>
        <ul className="space-y-1">
          {itens.map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-xs">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: corDe(i.id) }} />
              <span className="truncate text-muted-foreground" title={i.nome}>
                {i.nome}
              </span>
              <span className="ml-auto shrink-0 tabular-nums">{pct(i.valor, total)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Barras horizontais: o Nivo desenha a primeira linha embaixo, por isso inverte.
  const dados: BarDatum[] = [...itens].reverse().map((i) => ({ id: i.id, valor: i.valor }));
  return (
    <div
      style={{ height: Math.max(180, itens.length * 40 + 16) }}
      role="img"
      aria-label={rotulo}
    >
      <ResponsiveBar
        data={dados}
        keys={["valor"]}
        indexBy="id"
        layout="horizontal"
        margin={{ top: 4, right: 56, bottom: 4, left: 124 }}
        padding={0.35}
        borderRadius={6}
        colors={(d) => corDe(d.indexValue)}
        valueScale={{ type: "linear", nice: false }}
        enableLabel={false}
        enableGridX={false}
        enableGridY={false}
        axisBottom={null}
        axisLeft={{
          tickSize: 0,
          tickPadding: 8,
          format: (id: string) => truncar(porId.get(id)?.nome ?? id, 18),
        }}
        axisRight={{
          tickSize: 0,
          tickPadding: 8,
          format: (id: string) => pct(porId.get(id)?.valor ?? 0, total),
        }}
        theme={{
          ...temaGrafico,
          axis: { ...temaGrafico.axis, domain: { line: { strokeWidth: 0 } } },
        }}
        motionConfig={MOLA_GRAFICO}
        tooltip={(b) => (
          <CaixaTooltip>
            <LinhaTooltip
              cor={b.color}
              nome={porId.get(String(b.indexValue))?.nome ?? ""}
              valor={`${cheio(b.value)} · ${pct(b.value, total)}`}
            />
          </CaixaTooltip>
        )}
      />
    </div>
  );
}
