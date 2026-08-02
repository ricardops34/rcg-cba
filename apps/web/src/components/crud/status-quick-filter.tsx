"use client";

import { QuickFilterButton, QuickFilterGroup } from "@/components/crud/quick-filter-group";

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
    <QuickFilterGroup>
      {OPTIONS.map((opt) => (
        <QuickFilterButton key={opt.value} active={value === opt.value} onClick={() => onChange(opt.value)}>
          {labels[opt.value]}
        </QuickFilterButton>
      ))}
    </QuickFilterGroup>
  );
}
