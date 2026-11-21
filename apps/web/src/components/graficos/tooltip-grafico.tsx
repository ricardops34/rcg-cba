"use client";

import type { ReactNode } from "react";

/** Mola das animações do Nivo — a mesma em todos os gráficos. */
export const MOLA_GRAFICO = "gentle" as const;

/**
 * Caixa do tooltip dos gráficos Nivo, no visual dos popovers do sistema. É
 * React: nome de cliente/produto entra como texto, escapado pelo React.
 */
export function CaixaTooltip({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <div className="min-w-48 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      {titulo && <p className="mb-1 text-xs font-semibold">{titulo}</p>}
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

export function LinhaTooltip({
  cor,
  nome,
  valor,
  forte,
}: {
  cor?: string;
  nome: string;
  valor: string;
  /** Linha de total: separada por um traço e em negrito. */
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
