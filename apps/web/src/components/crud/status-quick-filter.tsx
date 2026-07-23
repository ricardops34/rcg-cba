"use client";

import { cn } from "@/lib/utils";

export type StatusFilterValue = "todos" | "ativos" | "inativos";

const OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "ativos", label: "Ativos" },
  { value: "inativos", label: "Inativos" },
];

export function StatusQuickFilter({
  value,
  onChange,
  activeLabel = "Ativos",
  inactiveLabel = "Inativos",
}: {
  value: StatusFilterValue;
  onChange: (value: StatusFilterValue) => void;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  const labels: Record<StatusFilterValue, string> = {
    todos: "Todos",
    ativos: activeLabel,
    inativos: inactiveLabel,
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-[3px]">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
            value === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {labels[opt.value]}
        </button>
      ))}
    </div>
  );
}
