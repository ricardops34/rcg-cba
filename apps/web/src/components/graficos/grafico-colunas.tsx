"use client";

import { ResponsiveBar, type BarDatum } from "@nivo/bar";
import { temaNivo, useTemaGrafico } from "@/components/graficos/tema-grafico";
import { CaixaTooltip, LinhaTooltip, MOLA_GRAFICO } from "@/components/graficos/tooltip-grafico";

/**
 * Colunas de uma série só (ex.: envios por mês), com Nivo (MIT). As colunas
 * crescem ao montar e deslizam quando os dados mudam. Contagem: o eixo só
 * marca inteiros e a grade segue as marcas.
 */
export function GraficoColunas({
  itens,
  cor = "var(--viz-1)",
  rotuloValor,
  altura = 240,
}: {
  itens: { rotulo: string; valor: number }[];
  /** Cor CSS das colunas. */
  cor?: string;
  /** O que a coluna conta, ex.: "Envios" — tooltip e leitor de tela. */
  rotuloValor: string;
  altura?: number;
}) {
  const tema = useTemaGrafico();
  if (!tema) return <div style={{ height: altura }} />;

  const numero = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  const maximo = Math.max(0, ...itens.map((i) => i.valor));
  const marcas = maximo < 5 ? Math.max(1, Math.ceil(maximo)) : 5;
  const dados: BarDatum[] = itens.map((i) => ({ rotulo: i.rotulo, valor: i.valor }));
  const corResolvida = tema.cor(cor);

  return (
    <div style={{ height: altura }} role="img" aria-label={`${rotuloValor} por período`}>
      <ResponsiveBar
        data={dados}
        keys={["valor"]}
        indexBy="rotulo"
        margin={{ top: 12, right: 8, bottom: 28, left: 44 }}
        padding={0.3}
        borderRadius={4}
        colors={() => corResolvida}
        enableLabel={false}
        enableGridY
        gridYValues={marcas}
        axisLeft={{
          tickSize: 0,
          tickPadding: 8,
          tickValues: marcas,
          format: (v: number) => (Number.isInteger(v) ? numero(v) : ""),
        }}
        axisBottom={{ tickSize: 0, tickPadding: 8 }}
        theme={temaNivo(tema)}
        motionConfig={MOLA_GRAFICO}
        tooltip={(b) => (
          <CaixaTooltip titulo={String(b.indexValue)}>
            <LinhaTooltip cor={b.color} nome={rotuloValor} valor={numero(b.value)} />
          </CaixaTooltip>
        )}
      />
    </div>
  );
}
