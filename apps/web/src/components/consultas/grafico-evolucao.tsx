"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Gráfico da evolução mensal — SVG escrito à mão, sem biblioteca de chart (o
 * projeto não tem nenhuma, e uma linha por mês não justifica trazer).
 *
 * Decisões que valem a pena saber antes de mexer:
 *
 * - Uma cor por série, na ordem fixa de --viz-1..6 (globals.css), atribuída
 *   pelo chamador e presa à entidade: filtrar um vendedor não repinta os
 *   outros. Da sétima série em diante o chamador agrupa em "Outros", em cinza.
 * - Cor nunca é o único canal: legenda com nome sempre presente (a partir de
 *   duas séries), rótulo direto na ponta quando são poucas, e a tabela da tela
 *   repete todos os números.
 * - Texto usa os tokens de tema (muted-foreground/foreground), nunca a cor da
 *   série — vários tons da paleta são ilegíveis como texto sobre o card claro.
 * - O que separa marcas encostadas é um vão de 2px na cor da superfície, não
 *   um contorno: contorno é tinta que não é dado.
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

const ALTURA = 320;
const MARGEM_TOPO = 16;
const MARGEM_BASE = 28;
const MARGEM_ESQUERDA = 64;
/** Sobra à direita para o rótulo na ponta da linha; sem rótulo, só respiro. */
const MARGEM_DIREITA_COM_ROTULO = 104;
const MARGEM_DIREITA = 16;
/** Acima disso os rótulos na ponta se atropelam — fica só a legenda. */
const MAX_SERIES_COM_ROTULO = 4;
/** Espessura máxima de barra: acima disso a marca vira bloco e some o ar. */
const BARRA_MAX = 24;
/** Vão na cor da superfície entre marcas encostadas. */
const VAO = 2;
/** Raio da ponta da barra; a base fica quadrada, presa à linha do zero. */
const RAIO_BARRA = 4;

/**
 * Caminho de uma barra vertical com o topo arredondado e a base reta. Com
 * altura menor que o raio, o topo é reto — arredondar aqui deformaria a marca
 * e falsearia o valor.
 */
function caminhoBarra(x: number, y: number, largura: number, altura: number): string {
  if (altura <= 0) return "";
  const r = Math.min(RAIO_BARRA, largura / 2, altura);
  return [
    `M ${x} ${y + altura}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + largura - r} ${y}`,
    `Q ${x + largura} ${y} ${x + largura} ${y + r}`,
    `L ${x + largura} ${y + altura}`,
    "Z",
  ].join(" ");
}

/**
 * Escala do eixo Y começando no zero e terminando num número redondo, com 4 a
 * 5 marcas. Em contagem de clientes o passo é inteiro — "2,5 clientes" não
 * existe.
 */
function escalaY(maximo: number, inteiro: boolean): { topo: number; marcas: number[] } {
  if (maximo <= 0) return { topo: inteiro ? 1 : 0, marcas: inteiro ? [0, 1] : [0] };
  const passos = inteiro ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  const bruto = maximo / 4;
  const magnitude = 10 ** Math.floor(Math.log10(bruto));
  const passo =
    passos.map((m) => m * magnitude).find((p) => p >= bruto) ?? 10 * magnitude;
  const topo = Math.ceil(maximo / passo) * passo;
  const marcas: number[] = [];
  for (let v = 0; v <= topo + passo / 1000; v += passo) marcas.push(v);
  return { topo, marcas };
}

/** Largura atual do elemento, acompanhada pelo ResizeObserver. */
function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entrada]) => {
      setLargura(entrada.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, largura };
}

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
  /** O que o eixo Y mede, para o leitor de tela e o título do gráfico. */
  rotuloValor: string;
  tipo?: TipoGraficoEvolucao;
}) {
  const { ref, largura } = useLargura<HTMLDivElement>();
  const [mesAtivo, setMesAtivo] = useState<number | null>(null);

  const inteiro = formato === "quantidade";
  const completo = (v: number) =>
    inteiro
      ? v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
      : v.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
          maximumFractionDigits: 2,
        });
  // O eixo é escrito compacto ("1,2 mil") para as marcas não brigarem por
  // espaço; o número cheio aparece no tooltip e na tabela.
  const compacto = (v: number) =>
    inteiro
      ? v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
      : v.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

  const empilhado = tipo === "area" || tipo === "empilhada";
  const emBarras = tipo === "barra" || tipo === "empilhada";
  // Rótulo na ponta é coisa de linha: na barra o valor cabe na cap, e em
  // gráfico empilhado a ponta é do total, não de nenhuma série.
  const comRotuloDireto = tipo === "linha" && series.length <= MAX_SERIES_COM_ROTULO;
  const margemDireita = comRotuloDireto ? MARGEM_DIREITA_COM_ROTULO : MARGEM_DIREITA;

  /** Soma das séries em cada mês — o topo da pilha. */
  const totalDoMes = (i: number) =>
    series.reduce((acc, s) => acc + (s.valores[i] ?? 0), 0);
  /**
   * Soma das séries de 0 até `ate` no mês `i`: o topo da faixa/segmento
   * daquela série na pilha. A ordem das séries vem do chamador (maior
   * primeiro), então a maior fica na base da pilha.
   */
  const acumulado = (ate: number, i: number) =>
    series.slice(0, ate + 1).reduce((acc, s) => acc + (s.valores[i] ?? 0), 0);
  // Empilhado precisa caber a soma; lado a lado, o maior valor isolado.
  const maximo = empilhado
    ? Math.max(0, ...meses.map((_, i) => totalDoMes(i)))
    : Math.max(0, ...series.flatMap((s) => s.valores));
  const { topo, marcas } = escalaY(maximo, inteiro);

  const larguraPlot = Math.max(0, largura - MARGEM_ESQUERDA - margemDireita);
  const alturaPlot = ALTURA - MARGEM_TOPO - MARGEM_BASE;
  /** Faixa de um mês — em barras cada mês ocupa uma banda, não um ponto. */
  const banda = meses.length > 0 ? larguraPlot / meses.length : larguraPlot;
  // Linha e área marcam o instante (ponto na borda); barra marca o período
  // (centro da banda). Um só mês não tem intervalo: vai para o meio da área.
  const x = (i: number) =>
    emBarras
      ? MARGEM_ESQUERDA + banda * (i + 0.5)
      : MARGEM_ESQUERDA +
        (meses.length <= 1 ? larguraPlot / 2 : (larguraPlot * i) / (meses.length - 1));
  const y = (v: number) =>
    MARGEM_TOPO + alturaPlot - (topo <= 0 ? 0 : (alturaPlot * v) / topo);
  const base = MARGEM_TOPO + alturaPlot;

  /**
   * Largura da barra. Agrupada divide a banda entre as séries, com o vão de
   * 2px entre vizinhas; empilhada usa uma barra só por mês. O teto de 24px
   * vale para as duas — barra mais grossa que isso vira bloco.
   */
  const larguraGrupo = Math.max(0, banda * 0.7);
  const larguraBarra = emBarras
    ? tipo === "barra"
      ? Math.min(
          BARRA_MAX,
          Math.max(1, (larguraGrupo - VAO * (series.length - 1)) / Math.max(series.length, 1)),
        )
      : Math.min(BARRA_MAX * 1.5, larguraGrupo)
    : 0;
  /** Onde começa o grupo de barras do mês, já centrado na banda. */
  const inicioGrupo = (i: number) =>
    tipo === "barra"
      ? x(i) - (larguraBarra * series.length + VAO * (series.length - 1)) / 2
      : x(i) - larguraBarra / 2;

  /** Quantos rótulos de mês cabem sem se sobrepor (cada um pede ~52px). */
  const passoRotuloMes = Math.max(1, Math.ceil((meses.length * 52) / Math.max(larguraPlot, 1)));

  const aoMover = (e: React.PointerEvent<SVGRectElement>) => {
    if (meses.length === 0) return;
    const caixa = e.currentTarget.getBoundingClientRect();
    const posicao = e.clientX - caixa.left;
    const indice = emBarras
      ? Math.floor((posicao / Math.max(caixa.width, 1)) * meses.length)
      : meses.length <= 1
        ? 0
        : Math.round((posicao / Math.max(caixa.width, 1)) * (meses.length - 1));
    setMesAtivo(Math.min(meses.length - 1, Math.max(0, indice)));
  };

  // Tooltip do mês sob o cursor: todas as séries, da maior para a menor.
  const valoresDoMes =
    mesAtivo == null
      ? []
      : series
          .map((s) => ({ ...s, valor: s.valores[mesAtivo] ?? 0 }))
          .sort((a, b) => b.valor - a.valor);
  const tooltipADireita = mesAtivo != null && x(mesAtivo) > MARGEM_ESQUERDA + larguraPlot / 2;

  return (
    <div className="space-y-3">
      <div ref={ref} className="relative w-full">
        {largura > 0 && (
          <svg
            width={largura}
            height={ALTURA}
            role="img"
            aria-label={`${rotuloValor} por mês, de ${meses[0] ?? "—"} a ${
              meses[meses.length - 1] ?? "—"
            }`}
            className="block"
          >
            {/* Grade e eixo: traço fino, um passo fora da superfície — devem
                sumir atrás dos dados. */}
            {marcas.map((m) => (
              <g key={m}>
                <line
                  x1={MARGEM_ESQUERDA}
                  x2={MARGEM_ESQUERDA + larguraPlot}
                  y1={y(m)}
                  y2={y(m)}
                  stroke="var(--border)"
                  strokeWidth={1}
                />
                <text
                  x={MARGEM_ESQUERDA - 8}
                  y={y(m) + 4}
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px] tabular-nums"
                >
                  {compacto(m)}
                </text>
              </g>
            ))}

            {meses.map((rotulo, i) =>
              i % passoRotuloMes === 0 || i === meses.length - 1 ? (
                <text
                  key={rotulo}
                  x={x(i)}
                  y={ALTURA - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {rotulo}
                </text>
              ) : null,
            )}

            {/* Realce do mês sob o cursor, atrás das séries: linha no ponto
                (linha/área) ou a banda inteira (barras, onde o mês é faixa). */}
            {mesAtivo != null &&
              (emBarras ? (
                <rect
                  x={MARGEM_ESQUERDA + banda * mesAtivo}
                  y={MARGEM_TOPO}
                  width={banda}
                  height={alturaPlot}
                  fill="var(--muted)"
                  opacity={0.45}
                />
              ) : (
                <line
                  x1={x(mesAtivo)}
                  x2={x(mesAtivo)}
                  y1={MARGEM_TOPO}
                  y2={MARGEM_TOPO + alturaPlot}
                  stroke="var(--border)"
                  strokeWidth={1}
                />
              ))}

            {tipo === "linha" &&
              series.map((s) => {
                const pontos = s.valores.map((v, i) => `${x(i)},${y(v)}`).join(" ");
                const ultimo = s.valores.length - 1;
                return (
                  <g key={s.id}>
                    <polyline
                      points={pontos}
                      fill="none"
                      stroke={s.cor}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* Ponta da linha com anel na cor da superfície, para
                        continuar legível onde duas séries se cruzam. */}
                    {ultimo >= 0 && (
                      <circle
                        cx={x(ultimo)}
                        cy={y(s.valores[ultimo] ?? 0)}
                        r={4}
                        fill={s.cor}
                        stroke="var(--card)"
                        strokeWidth={2}
                      />
                    )}
                    {comRotuloDireto && ultimo >= 0 && (
                      <text
                        x={x(ultimo) + 10}
                        y={y(s.valores[ultimo] ?? 0) + 4}
                        className="fill-foreground text-[11px] tabular-nums"
                      >
                        {compacto(s.valores[ultimo] ?? 0)}
                      </text>
                    )}
                    {mesAtivo != null && (
                      <circle
                        cx={x(mesAtivo)}
                        cy={y(s.valores[mesAtivo] ?? 0)}
                        r={4}
                        fill={s.cor}
                        stroke="var(--card)"
                        strokeWidth={2}
                      />
                    )}
                  </g>
                );
              })}

            {tipo === "area" &&
              series.map((s, si) => {
                const topoDaFaixa = (i: number) => acumulado(si, i);
                const baseDaFaixa = (i: number) => (si === 0 ? 0 : acumulado(si - 1, i));
                const subida = meses
                  .map((_, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(topoDaFaixa(i))}`)
                  .join(" ");
                const descida = [...meses]
                  .map((_, i) => meses.length - 1 - i)
                  .map((i) => `L ${x(i)} ${y(baseDaFaixa(i))}`)
                  .join(" ");
                return (
                  <g key={s.id}>
                    <path d={`${subida} ${descida} Z`} fill={s.cor} opacity={0.9} />
                    {/* A fronteira entre faixas é um vão na cor da superfície,
                        não um contorno na marca. */}
                    {si < series.length - 1 && (
                      <polyline
                        points={meses.map((_, i) => `${x(i)},${y(topoDaFaixa(i))}`).join(" ")}
                        fill="none"
                        stroke="var(--card)"
                        strokeWidth={VAO}
                      />
                    )}
                  </g>
                );
              })}

            {tipo === "barra" &&
              series.map((s, si) =>
                meses.map((_, i) => {
                  const valor = s.valores[i] ?? 0;
                  if (valor <= 0) return null;
                  const altura = base - y(valor);
                  return (
                    <path
                      key={`${s.id}-${i}`}
                      d={caminhoBarra(
                        inicioGrupo(i) + si * (larguraBarra + VAO),
                        y(valor),
                        larguraBarra,
                        altura,
                      )}
                      fill={s.cor}
                    />
                  );
                }),
              )}

            {tipo === "empilhada" &&
              meses.map((_, i) =>
                series.map((s, si) => {
                  const valor = s.valores[i] ?? 0;
                  if (valor <= 0) return null;
                  const topoSegmento = y(acumulado(si, i));
                  const baseSegmento = y(si === 0 ? 0 : acumulado(si - 1, i));
                  // O vão de 2px sai da altura do segmento, nunca da posição
                  // do topo: encolher por baixo mantém o topo no valor certo.
                  const altura = Math.max(0, baseSegmento - topoSegmento - VAO);
                  if (altura <= 0) return null;
                  const doTopo = si === series.length - 1;
                  return doTopo ? (
                    <path
                      key={`${s.id}-${i}`}
                      d={caminhoBarra(
                        inicioGrupo(i),
                        topoSegmento,
                        larguraBarra,
                        altura,
                      )}
                      fill={s.cor}
                    />
                  ) : (
                    <rect
                      key={`${s.id}-${i}`}
                      x={inicioGrupo(i)}
                      y={topoSegmento}
                      width={larguraBarra}
                      height={altura}
                      fill={s.cor}
                    />
                  );
                }),
              )}

            {/* Área de captura do mouse — cobre o plot inteiro para o alvo do
                hover ser bem maior que os pontos. */}
            <rect
              x={MARGEM_ESQUERDA}
              y={MARGEM_TOPO}
              width={larguraPlot}
              height={alturaPlot}
              fill="transparent"
              onPointerDown={aoMover}
              onPointerMove={aoMover}
              onPointerLeave={() => setMesAtivo(null)}
            />
          </svg>
        )}

        {mesAtivo != null && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-40 overflow-hidden rounded-lg border bg-popover px-3 py-2 shadow-md"
            style={
              tooltipADireita
                ? {
                    right: `${Math.max(largura - x(mesAtivo) + 12, 8)}px`,
                    left: "8px",
                  }
                : { left: `${x(mesAtivo) + 12}px`, right: "8px" }
            }
          >
            <p className="mb-1 text-xs font-medium">{meses[mesAtivo]}</p>
            <ul className="space-y-0.5">
              {valoresDoMes.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: s.cor }}
                  />
                  <span className="truncate text-muted-foreground">{s.nome}</span>
                  <span className="ml-auto tabular-nums">{completo(s.valor)}</span>
                </li>
              ))}
              {/* Empilhado desenha o total: sem ele, o leitor teria que somar
                  de cabeça justamente o número que a forma promete mostrar. */}
              {empilhado && series.length > 1 && (
                <li className="mt-1 flex items-center gap-2 border-t pt-1 text-xs font-medium">
                  <span className="text-muted-foreground">Total</span>
                  <span className="ml-auto tabular-nums">
                    {completo(totalDoMes(mesAtivo))}
                  </span>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Barra fina demais deixa de comunicar valor e vira listra de cor. Em
          vez de trocar a forma por baixo do usuário (que a escolheu), a tela
          diz o que fazer: menos meses ou menos séries. */}
      {tipo === "barra" && larguraBarra < 3 && largura > 0 && (
        <p className="text-xs text-muted-foreground">
          Com {series.length} séries em {meses.length} meses as barras ficam finas demais
          para comparar. Encurte o período ou filtre um vendedor — ou use linhas, que
          suportam mais séries.
        </p>
      )}

      {/* Uma série só dispensa legenda: o título já diz o que está plotado. */}
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
          {series.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5 text-xs">
              {/* A chave da legenda imita a marca: traço para linha, bloco
                  para as formas preenchidas. */}
              <span
                className={
                  tipo === "linha"
                    ? "h-0.5 w-4 shrink-0 rounded-full"
                    : "size-2.5 shrink-0 rounded-sm"
                }
                style={{ backgroundColor: s.cor }}
              />
              <span className="text-muted-foreground">{s.nome}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
