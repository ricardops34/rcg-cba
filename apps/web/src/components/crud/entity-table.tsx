"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SortableTableHead } from "@/components/crud/sortable-table-head";
import { useAuthStore } from "@/stores/auth-store";
import { ChevronLeft, ChevronRight, Inbox, Settings2 } from "lucide-react";

export interface ColumnDef<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Nome do campo usado em sortBy/sortOrder. Ausente = coluna não ordenável. */
  sortKey?: string;
  /**
   * Identificador estável pra persistir visibilidade da coluna (ver
   * `storageKey` de EntityTable). Ausente = usa `header` — só troque por um
   * `id` explícito se duas colunas puderem ter o mesmo `header` (ex.: duas
   * colunas de ação sem título).
   */
  id?: string;
}

/**
 * Lê/grava a lista de colunas ocultas no localStorage, isolada por usuário
 * logado (a chave leva o usuarioId) — por enquanto é por navegador, não
 * segue o usuário pra outro dispositivo.
 */
function useColumnVisibility(columnIds: string[], storageKey?: string) {
  const usuarioId = useAuthStore((s) => s.user?.id);
  const fullKey = storageKey && usuarioId ? `plataforma-colunas-${storageKey}-${usuarioId}` : null;

  // Inicializador preguiçoso (não um efeito): EntityTable só monta depois do
  // guard de autenticação liberar a tela, então o usuarioId já está
  // disponível na primeira renderização — não precisa reagir a mudanças.
  const [hidden, setHidden] = useState<string[]>(() => {
    if (!fullKey || typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(fullKey);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const toggle = (id: string) => {
    if (!fullKey) return;
    setHidden((atual) => {
      const estaOculta = atual.includes(id);
      // Impede esconder a última coluna visível.
      if (!estaOculta && columnIds.length - (atual.length + 1) < 1) return atual;
      const next = estaOculta ? atual.filter((i) => i !== id) : [...atual, id];
      window.localStorage.setItem(fullKey, JSON.stringify(next));
      return next;
    });
  };

  return { hidden, toggle, ativo: !!fullKey };
}

interface EntityTableProps<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRowClick?: (row: T) => void;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSortChange?: (sortBy: string, sortOrder: "asc" | "desc") => void;
  /**
   * Chave única da tela (ex.: "posicao-cliente") — quando informada, mostra
   * o botão de escolher colunas (engrenagem) e persiste a visibilidade no
   * navegador, por usuário logado. Sem essa prop a tabela funciona como
   * antes, sem seletor de colunas.
   */
  storageKey?: string;
}

export function EntityTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  emptyMessage = "Nenhum registro encontrado.",
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  onRowClick,
  sortBy,
  sortOrder = "asc",
  onSortChange,
  storageKey,
}: EntityTableProps<T>) {
  const toggleSort = (key: string) => {
    if (!onSortChange) return;
    if (sortBy !== key) onSortChange(key, "asc");
    else onSortChange(key, sortOrder === "asc" ? "desc" : "asc");
  };

  const columnIds = columns.map((col) => col.id ?? col.header);
  const { hidden, toggle, ativo: seletorAtivo } = useColumnVisibility(columnIds, storageKey);
  const colunasVisiveis = seletorAtivo
    ? columns.filter((col) => !hidden.includes(col.id ?? col.header))
    : columns;

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
      {seletorAtivo && (
        <div className="flex items-center justify-end border-b border-border/60 px-2 py-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Escolher colunas visíveis">
                <Settings2 className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Colunas visíveis</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.map((col) => {
                const id = col.id ?? col.header;
                return (
                  <DropdownMenuCheckboxItem
                    key={id}
                    checked={!hidden.includes(id)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggle(id)}
                  >
                    {col.header || "(sem título)"}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {colunasVisiveis.map((col) =>
                col.sortKey ? (
                  <SortableTableHead
                    key={col.id ?? col.header}
                    label={col.header}
                    className={col.className}
                    active={sortBy === col.sortKey}
                    order={sortOrder}
                    onClick={() => toggleSort(col.sortKey!)}
                  />
                ) : (
                  <TableHead key={col.id ?? col.header} className={col.className}>
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {col.header}
                    </span>
                  </TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {colunasVisiveis.map((col) => (
                    <TableCell key={col.id ?? col.header}>
                      <Skeleton className="h-4 w-full max-w-36" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={colunasVisiveis.length}
                  className="h-40 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Inbox className="size-6" />
                    {emptyMessage}
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              rows.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  onClick={() => onRowClick?.(row)}
                  className={onRowClick ? "cursor-pointer" : undefined}
                >
                  {colunasVisiveis.map((col) => (
                    <TableCell key={col.id ?? col.header} className={col.className}>
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 border-t border-border/60 px-4 py-2.5 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
          </span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger size="sm" className="w-[6.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / página
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Página {page} de {Math.max(totalPages, 1)}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
