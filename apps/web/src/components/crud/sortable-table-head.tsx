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
  return (
    <TableHead className={className}>
      <button
        type="button"
        className={cn(
          "flex items-center gap-1 text-xs font-medium tracking-wide uppercase hover:text-foreground",
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
