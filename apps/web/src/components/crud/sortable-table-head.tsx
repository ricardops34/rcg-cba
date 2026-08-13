"use client";

import { TableHead } from "@/components/ui/table";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function SortableTableHead({
  label,
  active,
  order,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  order: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  // O rótulo mora dentro de um botão flex, que por padrão encosta à esquerda
  // e ignora o text-align do cabeçalho. Em coluna numérica (text-right) isso
  // deixava o título desalinhado do número; aqui o botão ocupa a largura toda
  // e empurra o conteúdo para o mesmo lado da célula.
  const alinhamento = className?.includes("text-right")
    ? "w-full justify-end"
    : className?.includes("text-center")
      ? "w-full justify-center"
      : "";
  return (
    <TableHead className={className}>
      <button
        type="button"
        className={cn(
          "flex items-center gap-1 text-xs font-medium tracking-wide uppercase hover:text-foreground",
          alinhamento,
          active ? "text-foreground" : "text-muted-foreground",
        )}
        onClick={onClick}
      >
        {label}
        {active ? (
          order === "asc" ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )
        ) : (
          <ChevronsUpDown className="size-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}
