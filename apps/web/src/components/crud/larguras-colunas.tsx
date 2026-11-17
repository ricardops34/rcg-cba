"use client";

import { useCallback, useRef, useState } from "react";

const LARGURA_MINIMA = 56;

function ler(chave: string): Record<string, number> {
  try {
    const bruto = window.localStorage.getItem(chave);
    const v = bruto ? (JSON.parse(bruto) as Record<string, unknown>) : {};
    return Object.fromEntries(
      Object.entries(v).filter(([, n]) => typeof n === "number" && Number.isFinite(n)),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

function gravar(chave: string, larguras: Record<string, number>) {
  try {
    window.localStorage.setItem(chave, JSON.stringify(larguras));
  } catch {
    // Sem storage (aba anônima, bloqueio): a largura vale só até recarregar.
  }
}

/**
 * Larguras de coluna arrastáveis numa tabela (telas de Mix e Sugestão,
 * pedido de 16/11/2026). Cada tabela guarda as suas no navegador pela
 * `chave`; colunas sem largura guardada usam o `padrao`.
 *
 * Uso: `<Table className="table-fixed" style={estiloTabela}>` e, em cada
 * cabeçalho, `style={{ width: larguras.x }}` com `alca("x")` dentro (o
 * `SortableTableHead` e o `TableHeadRedimensionavel` já fazem isso).
 */
export function useLargurasColunas<C extends string>(
  chave: string,
  padrao: Record<C, number>,
) {
  const [larguras, setLarguras] = useState<Record<C, number>>(() => ({
    ...padrao,
    ...(typeof window === "undefined" ? {} : (ler(chave) as Partial<Record<C, number>>)),
  }));
  // Espelho para o arraste ler a largura sem recriar os ouvintes.
  const atual = useRef(larguras);

  const iniciarArraste = useCallback(
    (coluna: C, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const xInicial = e.clientX;
      const inicial = atual.current[coluna];
      const mover = (ev: PointerEvent) => {
        const proxima = Math.max(LARGURA_MINIMA, Math.round(inicial + ev.clientX - xInicial));
        setLarguras((l) => {
          const nova = { ...l, [coluna]: proxima };
          atual.current = nova;
          return nova;
        });
      };
      const soltar = () => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        gravar(chave, atual.current);
      };
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
    },
    [chave],
  );

  const restaurar = useCallback(() => {
    atual.current = padrao;
    setLarguras(padrao);
    gravar(chave, padrao);
  }, [chave, padrao]);

  /** A alça na borda direita do cabeçalho. Duplo clique volta ao padrão. */
  const alca = (coluna: C) => (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Arraste para mudar a largura da coluna"
      title="Arraste para mudar a largura (duplo clique restaura)"
      onPointerDown={(e) => iniciarArraste(coluna, e)}
      onDoubleClick={restaurar}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-0 right-0 z-10 h-full w-2 cursor-col-resize touch-none select-none after:absolute after:top-1/4 after:right-0.5 after:h-1/2 after:w-px after:bg-border hover:after:bg-primary"
    />
  );

  const total = (Object.values(larguras) as number[]).reduce((s, n) => s + n, 0);
  /** Largura da tabela: a soma das colunas, sem ficar menor que o espaço. */
  const estiloTabela: React.CSSProperties = { width: total, minWidth: "100%" };

  return { larguras, alca, estiloTabela };
}
