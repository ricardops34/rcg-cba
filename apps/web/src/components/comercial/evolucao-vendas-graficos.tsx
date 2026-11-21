"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ResponsiveBar, type BarDatum } from "@nivo/bar";
import { ResponsiveLine } from "@nivo/line";
import { ResponsivePie } from "@nivo/pie";
import type {
  SerieEvolucao,
  TipoGraficoEvolucao,
} from "@/components/consultas/grafico-evolucao";
import { temaNivo, useTemaGrafico } from "@/components/graficos/tema-grafico";

/**
 * Gráficos da Comercial > Evolução de Vendas com Nivo (MIT) — 20/11/2026,
 * escolhido pelas animações (o ECharts foi tentado antes e descartado). As
 * Consultas seguem no SVG próprio (consultas/grafico-evolucao.tsx); os tipos
 * de série e de forma são os mesmos de lá.
 *
 * - Animação por mola (react-spring): barras crescem ao montar, agrupadas ↔
 *   empilhadas deslizam, linha ↔ área sobem/descem as faixas, a rosca abre.
 *   Linha → barra troca de componente (sem morph): a barra nasce crescendo.
 * - Cores: --viz-N presas à entidade, na ordem do chamador; "Outros" em cinza.
 *   Resolvidas para rgba (tema-grafico.ts) porque a mola interpola cor.
 * - Tooltip e legenda são React: nome de cliente/produto entra como texto,
 *   escapado pelo próprio React.
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
const truncar = (texto: string, max: number) =>
  texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;

const MOLA = "gentle" as const;

/** Caixa do tooltip, no visual dos popovers do sistema. */
function CaixaTooltip({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <div className="min-w-48 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      {titulo && <p className="mb-1 text-xs font-semibold">{titulo}</p>}
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function LinhaTooltip({
  cor,
  nome,
  valor,
  forte,
}: {
  cor?: string;
  nome: string;
  valor: string;
  forte?: boolean;
}) {
  return (
    <li className={`flex items-center gap-2 text-xs ${forte ? "border-t pt-1 font-semibold" : ""}`}>
      {cor && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: cor }} />}
      <span className="max-w-56 truncate text-muted-foreground">{nome}</span>
      <span className="ml-auto pl-3 tabular-nums">{valor}</span>
    </li>
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
  // Clique na legenda esconde/mostra a série.
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());

  const visiveis = useMemo(() => series.filter((s) => !ocultas.has(s.id)), [series, ocultas]);
  const corDe = useMemo(() => {
    const mapa = new Map(series.map((s) => [s.id, tema ? tema.cor(s.cor) : ""]));
    return (id: string | number) => mapa.get(String(id)) ?? "";
  }, [series, tema]);
  const nomeDe = useMemo(() => {
    const mapa = new Map(series.map((s) => [s.id, s.nome]));
    return (id: string | number) => mapa.get(String(id)) ?? String(id);
  }, [series]);

  const emBarras = tipo === "barra" || tipo === "empilhada";
  const empilhado = tipo === "area" || tipo === "empilhada";

  const dadosLinha = useMemo(
    () =>
      visiveis.map((s) => ({
        id: s.id,
        data: meses.map((m, i) => ({ x: m, y: s.valores[i] ?? 0 })),
      })),
    [visiveis, meses],
  );
  const dadosBarra = useMemo<BarDatum[]>(
    () =>
      meses.map((m, i) => {
        const linha: BarDatum = { mes: m };
        for (const s of visiveis) linha[s.id] = s.valores[i] ?? 0;
        return linha;
      }),
    [visiveis, meses],
  );
  const totalDoMes = (mes: string | number) => {
    const i = meses.indexOf(String(mes));
    return visiveis.reduce((a, s) => a + (s.valores[i] ?? 0), 0);
  };

  if (!tema) return <div style={{ height: 360 }} />;
  const temaGrafico = temaNivo(tema);
  const eixoEsquerdo = {
    tickSize: 0,
    tickPadding: 8,
    tickValues: 5,
    format: (v: number) => moedaCompacta(v),
  };
  const eixoBase = { tickSize: 0, tickPadding: 10 };

  return (
    <div className="space-y-3">
      <div
        style={{ height: 360 }}
        role="img"
        aria-label={`Venda por mês, de ${meses[0] ?? "—"} a ${meses[meses.length - 1] ?? "—"}`}
      >
        {visiveis.length === 0 ? (
          <p className="pt-24 text-center text-sm text-muted-foreground">
            Todas as séries estão ocultas — clique na legenda para mostrar.
          </p>
        ) : emBarras ? (
          <ResponsiveBar
            data={dadosBarra}
            keys={visiveis.map((s) => s.id)}
            indexBy="mes"
            groupMode={tipo === "empilhada" ? "stacked" : "grouped"}
            margin={{ top: 24, right: 16, bottom: 32, left: 64 }}
            padding={0.3}
            innerPadding={tipo === "empilhada" ? 1 : 2}
            borderRadius={4}
            colors={(d) => corDe(d.id)}
            enableLabel={false}
            enableGridY
            axisLeft={eixoEsquerdo}
            axisBottom={eixoBase}
            theme={temaGrafico}
            motionConfig={MOLA}
            tooltip={(b) => (
              <CaixaTooltip titulo={String(b.indexValue)}>
                <LinhaTooltip cor={b.color} nome={nomeDe(b.id)} valor={moedaCheia(b.value)} />
                {visiveis.length > 1 && (
                  <LinhaTooltip
                    nome={empilhado ? "Total do mês" : "% do mês"}
                    valor={
                      empilhado
                        ? moedaCheia(totalDoMes(b.indexValue))
                        : pct(b.value, totalDoMes(b.indexValue))
                    }
                    forte
                  />
                )}
              </CaixaTooltip>
            )}
          />
        ) : (
          <ResponsiveLine
            data={dadosLinha}
            margin={{ top: 24, right: 24, bottom: 32, left: 64 }}
            xScale={{ type: "point" }}
            yScale={{ type: "linear", min: 0, max: "auto", stacked: tipo === "area" }}
            curve="monotoneX"
            colors={(s: { id: string | number }) => corDe(s.id)}
            lineWidth={3}
            enableArea={tipo === "area" || visiveis.length <= 3}
            areaOpacity={tipo === "area" ? 0.75 : 0.12}
            pointSize={9}
            pointColor={({ series: s }: { series: { color: string } }) => s.color}
            pointBorderWidth={2}
            pointBorderColor={tema.superficie}
            enableGridX={false}
            axisLeft={eixoEsquerdo}
            axisBottom={eixoBase}
            enableSlices="x"
            enableCrosshair
            crosshairType="x"
            theme={temaGrafico}
            motionConfig={MOLA}
            sliceTooltip={({ slice }) => {
              const pontos = [...slice.points].sort(
                (a, b) => Number(b.data.y ?? 0) - Number(a.data.y ?? 0),
              );
              const total = pontos.reduce((a, p) => a + Number(p.data.y ?? 0), 0);
              return (
                <CaixaTooltip titulo={String(pontos[0]?.data.x ?? "")}>
                  {pontos.map((p) => (
                    <LinhaTooltip
                      key={p.id}
                      cor={p.seriesColor}
                      nome={nomeDe(p.seriesId)}
                      valor={moedaCheia(Number(p.data.y ?? 0))}
                    />
                  ))}
                  {empilhado && pontos.length > 1 && (
                    <LinhaTooltip nome="Total" valor={moedaCheia(total)} forte />
                  )}
                </CaixaTooltip>
              );
            }}
          />
        )}
      </div>

      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {series.map((s) => {
            const oculta = ocultas.has(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`flex items-center gap-1.5 text-xs transition-opacity ${oculta ? "opacity-40" : "hover:opacity-80"}`}
                  title={oculta ? "Mostrar no gráfico" : "Esconder do gráfico"}
                  onClick={() =>
                    setOcultas((atual) => {
                      const nova = new Set(atual);
                      if (nova.has(s.id)) nova.delete(s.id);
                      else nova.add(s.id);
                      return nova;
                    })
                  }
                >
                  <span
                    className={tipo === "linha" ? "h-1 w-4 shrink-0 rounded-full" : "size-2.5 shrink-0 rounded-sm"}
                    style={{ backgroundColor: corDe(s.id) }}
                  />
                  <span className={`text-muted-foreground ${oculta ? "line-through" : ""}`}>{s.nome}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
  const porId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);

  if (!tema) return <div style={{ height: 280 }} />;
  const temaGrafico = temaNivo(tema);
  const corDe = (id: string | number) => tema.cor(porId.get(String(id))?.cor ?? "");

  if (forma === "rosca") {
    return (
      <div className="space-y-3">
        <div style={{ height: 260 }} role="img" aria-label="Participação de cada um no total do período">
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
            motionConfig={MOLA}
            transitionMode="startAngle"
            tooltip={({ datum }) => (
              <CaixaTooltip>
                <LinhaTooltip
                  cor={datum.color}
                  nome={String(datum.label)}
                  valor={`${moedaCheia(datum.value)} · ${pct(datum.value, total)}`}
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
                    {moedaCompacta(total)}
                  </text>
                  <text
                    x={centerX}
                    y={centerY + 14}
                    textAnchor="middle"
                    style={{ fill: tema.textoSuave, fontSize: 11 }}
                  >
                    Total
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
      aria-label="Participação de cada um no total do período"
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
        motionConfig={MOLA}
        tooltip={(b) => (
          <CaixaTooltip>
            <LinhaTooltip
              cor={b.color}
              nome={porId.get(String(b.indexValue))?.nome ?? ""}
              valor={`${moedaCheia(b.value)} · ${pct(b.value, total)}`}
            />
          </CaixaTooltip>
        )}
      />
    </div>
  );
}
