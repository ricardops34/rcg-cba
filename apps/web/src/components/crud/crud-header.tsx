"use client";

import { Plus, RefreshCw, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface CrudHeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh?: () => void;
  onCreate?: () => void;
  createLabel?: string;
  isRefreshing?: boolean;
  placeholder?: string;
  actions?: ReactNode;
}

export function CrudHeader({
  search,
  onSearchChange,
  onRefresh,
  onCreate,
  createLabel = "Novo",
  isRefreshing,
  placeholder = "Buscar...",
  actions,
}: CrudHeaderProps) {
  return (
    <div data-tour="crud-busca" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-xs">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className="pl-8"
        />
      </div>

      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        {actions}
        {onRefresh && (
          <Button className="flex-1 sm:flex-none" variant="outline" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
            Atualizar
          </Button>
        )}
        {onCreate && (
          <Button className="flex-1 sm:flex-none" onClick={onCreate}>
            <Plus className="size-4" />
            {createLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
