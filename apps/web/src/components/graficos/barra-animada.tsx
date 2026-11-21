import type { CSSProperties } from "react";

/**
 * Barra de proporção/progresso que cresce com efeito de mola ao aparecer e
 * desliza quando o valor muda — o mesmo movimento dos gráficos Nivo, sem pôr
 * um gráfico inteiro em cada linha de tabela. A animação é CSS
 * (`.barra-animada` em globals.css). NÃO desligar por prefers-reduced-motion:
 * o Windows liga esse sinal só por ter "Efeitos de animação" desligado.
 */
export function BarraAnimada({
  perc,
  cor = "bg-primary",
  altura = "h-2",
  className = "",
  style,
}: {
  /** 0 a 100; fora disso é cortado. */
  perc: number;
  /** Classe de fundo da parte cheia, ex.: "bg-primary". */
  cor?: string;
  /** Classe de altura, ex.: "h-2". */
  altura?: string;
  /** Classes extras do trilho. */
  className?: string;
  /** Estilo da parte cheia (ex.: cor por variável CSS). */
  style?: CSSProperties;
}) {
  const largura = Math.min(100, Math.max(0, Number.isFinite(perc) ? perc : 0));
  return (
    <div className={`${altura} w-full overflow-hidden rounded-full bg-muted ${className}`}>
      <div
        className={`barra-animada h-full rounded-full ${cor}`}
        style={{ ...style, width: `${largura}%` }}
      />
    </div>
  );
}
