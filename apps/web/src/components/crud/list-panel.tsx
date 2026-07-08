"use client";

import { ChevronRight, ChevronLeft, Inbox, MoreHorizontal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ListPanelProps<T> {
  rows: T[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onRowClick?: (row: T) => void;
  renderAvatar: (row: T) => React.ReactNode;
  renderTitle: (row: T) => React.ReactNode;
  renderSubtitle: (row: T) => React.ReactNode;
  renderMeta?: (row: T) => React.ReactNode;
  renderActions?: (row: T) => React.ReactNode;
}

export function ListPanel<T>({
  rows,
  rowKey,
  isLoading,
  emptyMessage = "Nenhum registro encontrado.",
  page,
  totalPages,
  onPageChange,
  onRowClick,
  renderAvatar,
  renderTitle,
  renderSubtitle,
  renderMeta,
  renderActions,
}: ListPanelProps<T>) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      {isLoading && (
        <div className="divide-y divide-border/60">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-4 py-16 text-muted-foreground">
          <Inbox className="size-6" />
          <p className="text-sm">{emptyMessage}</p>
        </div>
      )}

      {!isLoading && rows.length > 0 && (
        <div className="divide-y divide-border/60">
          {rows.map((row) => (
            <div
              key={rowKey(row)}
              onClick={() => onRowClick?.(row)}
              className={cn(
                "group flex items-center gap-3 px-4 py-3 transition-colors",
                onRowClick && "cursor-pointer hover:bg-muted/50",
              )}
            >
              {renderAvatar(row)}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{renderTitle(row)}</p>
                <p className="truncate text-sm text-muted-foreground">{renderSubtitle(row)}</p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                {renderMeta?.(row)}
                {renderActions ? (
                  <div onClick={(e) => e.stopPropagation()}>{renderActions(row)}</div>
                ) : (
                  onRowClick && (
                    <ChevronRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border/60 px-4 py-2.5">
          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
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
      )}
    </div>
  );
}

export { MoreHorizontal };
