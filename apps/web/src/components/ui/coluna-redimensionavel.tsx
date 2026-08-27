"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const LARGURA_MINIMA = 240;
const PROPORCAO_MAXIMA = 0.7;

/** Largura salva para este painel, ou o padrão (inclusive no servidor). */
function larguraGuardada(chave: string, padrao: number, minima: number) {
  if (typeof window === "undefined") return padrao;
  const guardada = Number(window.localStorage.getItem(chave));
  return Number.isFinite(guardada)
    ? Math.max(minima, guardada)
    : padrao;
}

/**
 * Coluna lateral com a borda arrastável, para painéis **encaixados** no
 * layout (não sobrepostos).
 *
 * Irmã do `ResizableSheetContent`, que faz o mesmo para cortinas — a
 * diferença é que aqui a coluna divide o espaço com o resto da tela em vez de
 * flutuar sobre ele, então a largura é `flex-basis` e não `position: fixed`.
 *
 * Cada painel guarda a própria largura (`chaveArmazenamento`): a coluna de
 * conversas e a de um formulário de orçamento não querem o mesmo tamanho, e
 * uma chave única faria arrastar uma virar o padrão da outra.
 */
export function ColunaRedimensionavel({
  larguraPadrao,
  larguraMinima = LARGURA_MINIMA,
  chaveArmazenamento,
  lado = "direita",
  className,
  children,
}: {
  larguraPadrao: number;
  /** Evita que conteúdo estrutural seja salvo numa largura em que deixa de ser utilizável. */
  larguraMinima?: number;
  chaveArmazenamento: string;
  /** De que lado a coluna está — decide para onde o arraste aumenta. */
  lado?: "esquerda" | "direita";
  className?: string;
  children: React.ReactNode;
}) {
  // Inicializador preguiçoso, como no `ResizableSheetContent`: a largura
  // guardada entra já na primeira renderização, sem um segundo desenho.
  const [largura, setLargura] = useState(() =>
    larguraGuardada(chaveArmazenamento, larguraPadrao, larguraMinima),
  );
  const larguraRef = useRef(largura);

  const aoArrastar = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const xInicial = e.clientX;
      const larguraInicial = larguraRef.current;
      const maxima = window.innerWidth * PROPORCAO_MAXIMA;

      const mover = (ev: PointerEvent) => {
        // Puxar para a esquerda alarga a coluna da direita, e vice-versa.
        const delta =
          lado === "direita" ? xInicial - ev.clientX : ev.clientX - xInicial;
        const proxima = Math.min(
          maxima,
          Math.max(larguraMinima, larguraInicial + delta),
        );
        larguraRef.current = proxima;
        setLargura(proxima);
      };
      const soltar = () => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        window.localStorage.setItem(
          chaveArmazenamento,
          String(larguraRef.current),
        );
      };
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
    },
    [chaveArmazenamento, lado, larguraMinima],
  );

  return (
    <div
      className={cn("relative h-full min-h-0 shrink-0", className)}
      style={{ width: largura }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar painel"
        onPointerDown={aoArrastar}
        className={cn(
          "absolute top-0 z-10 h-full w-1.5 touch-none cursor-ew-resize select-none hover:bg-primary/30 active:bg-primary/40",
          lado === "direita" ? "-left-1.5" : "-right-1.5",
        )}
      />
      {children}
    </div>
  );
}
