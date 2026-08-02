"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Contêiner "pill" — mesmo visual de StatusQuickFilter, reaproveitado por
 * qualquer grupo de filtros rápidos de seleção única (ex.: atalhos de
 * Posição de Cliente: dias sem comprar, bloqueados, ativo). */
export function QuickFilterGroup({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-muted p-[3px]">
      {children}
    </div>
  );
}

export function QuickFilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
