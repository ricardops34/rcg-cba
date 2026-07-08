"use client";

import { Plus, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface CrudHeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh?: () => void;
  onCreate?: () => void;
  createLabel?: string;
  isRefreshing?: boolean;
}

export function CrudHeader({
  search,
  onSearchChange,
  onRefresh,
  onCreate,
  createLabel = "Novo",
  isRefreshing,
}: CrudHeaderProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-xs">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar..."
          className="pl-8"
        />
      </div>
      <div className="flex gap-2">
        {onRefresh && (
          <Button variant="outline" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
            Atualizar
          </Button>
        )}
        {onCreate && (
          <Button onClick={onCreate}>
            <Plus className="size-4" />
            {createLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
