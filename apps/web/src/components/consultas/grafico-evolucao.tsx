"use client";

import { useMemo, useState } from "react";
import { ResponsiveBar, type BarDatum } from "@nivo/bar";
import { ResponsiveLine } from "@nivo/line";
import { temaNivo, useTemaGrafico } from "@/components/graficos/tema-grafico";
import { CaixaTooltip, LinhaTooltip, MOLA_GRAFICO } from "@/components/graficos/tooltip-grafico";

/**
 * Gráfico da evolução mensal com Nivo (MIT) — usado nas Consultas e na
 * Comercial > Evolução de Vendas. Era SVG escrito à mão até 20/11/2026; trocou
 * pelas animações (o ECharts foi tentado antes e descartado — ver
 * docs/planos/2026-11-20-evolucao-vendas-comercial.md).
 *
 * Decisões que valem a pena saber antes de mexer:
 *
 * - Uma cor por série, na ordem fixa de --viz-1..6 (globals.css), atribuída
 *   pelo chamador e presa à entidade: filtrar um vendedor não repinta os
 *   outros. Da sétima série em diante o chamador agrupa em "Outros", em cinza.
 *   As cores são resolvidas para rgba (tema-grafico.ts) porque a mola do Nivo
 *   interpola cor e não entende `var()` nem oklch.
 * - Animação por mola: barras crescem ao abrir, agrupadas ↔ empilhadas
 *   deslizam, linha ↔ área sobem as faixas. Linha → barra troca de componente,
 *   então a barra nasce crescendo. NÃO desligar por prefers-reduced-motion: o
 *   Windows liga esse sinal só por ter "Efeitos de animação" desligado.
 * - Sem degradê: o `linearGradientDef` com cor `inherit` sai preto no Nivo.
 * - Cor nunca é o único canal: legenda com nome (clicável — esconde/mostra a
 *   série), tooltip com os valores e a tabela da tela repetindo os números.
 * - Tooltip e legenda são React: nome que vem do ERP entra como texto.
 */

/** Uma série do gráfico: um vendedor (ou o agrupamento "Outros"). */
export interface SerieEvolucao {
  id: string;
  nome: string;
  /** Um valor por mês, na mesma ordem de `meses`. */
  valores: number[];
  /** Cor da série, ex.: "var(--viz-1)". */
  cor: string;
}

/**
 * Formas que servem a estes dados (séries × meses) — cada uma responde a uma
 * pergunta diferente, e é por isso que a escolha é do usuário:
 *
 * - `linha`     — como cada vendedor evoluiu no tempo (o padrão);
 * - `area`      — como o total se compôs mês a mês (parte do todo);
 * - `barra`     — comparar os vendedores dentro de cada mês;
 * - `empilhada` — o total do mês e a participação de cada um nele.
 *
 * Pizza/rosca não entram: elas descartam o eixo do tempo, que é justamente o
 * assunto desta consulta.
 */
export type TipoGraficoEvolucao = "linha" | "area" | "barra" | "empilhada";

export const TIPOS_GRAFICO_EVOLUCAO: {
  valor: TipoGraficoEvolucao;
  label: string;
  descricao: string;
}[] = [
  {
    valor: "linha",
    label: "Linhas",
    descricao: "A evolução de cada série no tempo.",
  },
  {
    valor: "area",
    label: "Área empilhada",
    descricao: "A composição do total mês a mês.",
  },
  {
    valor: "barra",
    label: "Barras agrupadas",
    descricao: "Comparação entre séries dentro de cada mês.",
  },
  {
    valor: "empilhada",
    label: "Barras empilhadas",
    descricao: "O total de cada mês e a participação de cada série.",
  },
];

const ALTURA = 360;

const pct = (parte: number, total: number) =>
  total
    ? `${((parte / total) * 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%`
    : "—";

export function GraficoEvolucao({
  meses,
  series,
  formato,
  rotuloValor,
  tipo = "linha",
}: {
  /** Rótulos do eixo X, ex.: ["Jan/26", "Fev/26", ...]. */
  meses: string[];
  series: SerieEvolucao[];
  formato: "moeda" | "quantidade";
  /** O que o eixo Y mede, para o leitor de tela. */
  rotuloValor: string;
  tipo?: TipoGraficoEvolucao;
}) {
  const tema = useTemaGrafico();
  // Clique na legenda esconde/mostra a série.
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());

  const inteiro = formato === "quantidade";
  const completo = (v: number) =>
    inteiro
      ? v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
      : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
  // O eixo é compacto ("1,2 mil") para as marcas não brigarem por espaço; o
  // número cheio aparece no tooltip e na tabela.
  const compacto = (v: number) =>
    inteiro
      ? v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
      : v.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

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

  if (!tema) return <div style={{ height: ALTURA }} />;
  const temaGrafico = temaNivo(tema);
  // Contagem de clientes: marcas só em inteiros ("2,5 clientes" não existe).
  const maximo = Math.max(
    0,
    ...(empilhado ? meses.map((m) => totalDoMes(m)) : visiveis.flatMap((s) => s.valores)),
  );
  const eixoEsquerdo = {
    tickSize: 0,
    tickPadding: 8,
    tickValues: inteiro && maximo < 5 ? Math.max(1, Math.ceil(maximo)) : 5,
    format: (v: number) => (inteiro && !Number.isInteger(v) ? "" : compacto(v)),
  };
  const eixoBase = { tickSize: 0, tickPadding: 10 };

  return (
    <div className="space-y-3">
      <div
        style={{ height: ALTURA }}
        role="img"
        aria-label={`${rotuloValor} por mês, de ${meses[0] ?? "—"} a ${meses[meses.length - 1] ?? "—"}`}
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
            gridYValues={eixoEsquerdo.tickValues}
            axisLeft={eixoEsquerdo}
            axisBottom={eixoBase}
            theme={temaGrafico}
            motionConfig={MOLA_GRAFICO}
            tooltip={(b) => (
              <CaixaTooltip titulo={String(b.indexValue)}>
                <LinhaTooltip cor={b.color} nome={nomeDe(b.id)} valor={completo(b.value)} />
                {visiveis.length > 1 && (
                  <LinhaTooltip
                    nome={empilhado ? "Total do mês" : "% do mês"}
                    valor={
                      empilhado
                        ? completo(totalDoMes(b.indexValue))
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
            gridYValues={eixoEsquerdo.tickValues}
            axisLeft={eixoEsquerdo}
            axisBottom={eixoBase}
            enableSlices="x"
            enableCrosshair
            crosshairType="x"
            theme={temaGrafico}
            motionConfig={MOLA_GRAFICO}
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
                      valor={completo(Number(p.data.y ?? 0))}
                    />
                  ))}
                  {/* Empilhado desenha o total: sem ele, o leitor teria que
                      somar de cabeça o número que a forma promete mostrar. */}
                  {empilhado && pontos.length > 1 && (
                    <LinhaTooltip nome="Total" valor={completo(total)} forte />
                  )}
                </CaixaTooltip>
              );
            }}
          />
        )}
      </div>

      {/* Uma série só dispensa legenda: o título já diz o que está plotado. */}
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
                  {/* A chave da legenda imita a marca: traço para linha,
                      bloco para as formas preenchidas. */}
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
