"use client";

import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface CrudHeaderProps {
  title: string;
  description?: string;
  search: string;
  onSearchChange: (value: string) => void;
  onCreate?: () => void;
  createLabel?: string;
}

export function CrudHeader({
  title,
  description,
  search,
  onSearchChange,
  onCreate,
  createLabel = "Novo",
}: CrudHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar..."
            className="w-56 pl-8"
          />
        </div>
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
