"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SortableTableHead } from "@/components/crud/sortable-table-head";
import { Paginacao } from "@/components/crud/paginacao";
import { useAuthStore } from "@/stores/auth-store";
import { ApiError } from "@/lib/api-client";
import {
  Inbox,
  Settings2,
  TriangleAlert,
} from "lucide-react";

/** Explica por que a listagem não carregou, em vez de fingir lista vazia. */
function mensagemDeErro(error: unknown) {
  if (error instanceof ApiError && error.status === 403) {
    return "Seu perfil não tem permissão para visualizar estes registros.";
  }
  if (error instanceof ApiError) return error.message;
  return "Não foi possível carregar os registros.";
}

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
  /**
   * Erro da consulta que alimenta a tabela (o `error` do useResourceList).
   * Sem isso, uma listagem que falhou (403 por falta de permissão, rede fora)
   * fica idêntica a uma sem registros — o usuário lê "nenhum cadastro" e vai
   * procurar o problema nos dados.
   */
  error?: unknown;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRowClick?: (row: T) => void;
  /** Classe extra por linha — destaque de uma condição da linha inteira. */
  rowClassName?: (row: T) => string | undefined;
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
  /**
   * Seleção para ação em lote: com as duas props, a tabela ganha uma coluna
   * de checkbox (o do cabeçalho marca/desmarca a página). As chaves são as de
   * `rowKey` e sobrevivem à troca de página — quem chama decide quando limpar.
   */
  selectedKeys?: string[];
  onSelectedKeysChange?: (keys: string[]) => void;
  /**
   * Linha que não pode entrar na seleção: devolve o motivo (vira o title do
   * checkbox desabilitado) ou null quando pode. Ausente = todas podem.
   */
  /**
   * Como a linha aparece no **celular**: um cartão no lugar da tabela. Sem esta
   * prop, o celular segue com a tabela rolando para o lado. Não vale junto com
   * seleção em lote (que depende da coluna de checkbox).
   */
  mobileCard?: (row: T) => React.ReactNode;
  rowSelectionBlocked?: (row: T) => string | null;
}

export function EntityTable<T>({
  columns,
  rows,
  rowKey,
  isLoading,
  emptyMessage = "Nenhum registro encontrado.",
  error,
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  onRowClick,
  rowClassName,
  sortBy,
  sortOrder = "asc",
  onSortChange,
  storageKey,
  selectedKeys,
  onSelectedKeysChange,
  rowSelectionBlocked,
  mobileCard,
}: EntityTableProps<T>) {
  const selecionavel = !!selectedKeys && !!onSelectedKeysChange;
  const chavesPagina = selecionavel
    ? rows.filter((r) => !rowSelectionBlocked?.(r)).map(rowKey)
    : [];
  const marcadosNaPagina = chavesPagina.filter((k) => selectedKeys!.includes(k)).length;
  const estadoCabecalho: boolean | "indeterminate" =
    marcadosNaPagina === 0
      ? false
      : marcadosNaPagina === chavesPagina.length
        ? true
        : "indeterminate";
  const alternarPagina = () => {
    if (!selecionavel) return;
    onSelectedKeysChange!(
      estadoCabecalho === true
        ? selectedKeys!.filter((k) => !chavesPagina.includes(k))
        : [...new Set([...selectedKeys!, ...chavesPagina])],
    );
  };
  const alternarLinha = (chave: string) => {
    if (!selecionavel) return;
    onSelectedKeysChange!(
      selectedKeys!.includes(chave)
        ? selectedKeys!.filter((k) => k !== chave)
        : [...selectedKeys!, chave],
    );
  };

  const toggleSort = (key: string) => {
    if (!onSortChange) return;
    if (sortBy !== key) onSortChange(key, "asc");
    else onSortChange(key, sortOrder === "asc" ? "desc" : "asc");
  };

  const columnIds = columns.map((col) => col.id ?? col.header);
  const { hidden, toggle, ativo: seletorAtivo } = useColumnVisibility(columnIds, storageKey);
  // Cartões só sem seleção em lote: ela precisa da coluna de checkbox.
  const usaCartoes = !!mobileCard && !selecionavel;
  const colunasVisiveis = seletorAtivo
    ? columns.filter((col) => !hidden.includes(col.id ?? col.header))
    : columns;

  return (
    <div data-tour="crud-lista" className="overflow-hidden rounded-xl border border-border/70 bg-card">
      {seletorAtivo && (
        <div
          className={cn(
            "flex items-center justify-end border-b border-border/60 px-2 py-1",
            usaCartoes && "max-md:hidden",
          )}
        >
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
      {usaCartoes && (
        <div className="divide-y divide-border/60 md:hidden">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2 px-3 py-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          {!isLoading && rows.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-3 py-12 text-center text-sm text-muted-foreground">
              {error ? (
                <>
                  <TriangleAlert className="size-6 text-amber-500" />
                  {mensagemDeErro(error)}
                </>
              ) : (
                <>
                  <Inbox className="size-6" />
                  {emptyMessage}
                </>
              )}
            </div>
          )}
          {!isLoading &&
            rows.map((row) => (
              <div
                key={rowKey(row)}
                role={onRowClick ? "button" : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={(e) => {
                  // Mesmo cuidado da tabela: menus e diálogos abrem em portal e
                  // o clique deles sobe pelo React até aqui.
                  if (!e.currentTarget.contains(e.target as Node)) return;
                  onRowClick?.(row);
                }}
                className={cn(
                  "px-3 py-3",
                  onRowClick && "cursor-pointer active:bg-muted/60",
                  rowClassName?.(row),
                )}
              >
                {mobileCard!(row)}
              </div>
            ))}
        </div>
      )}
      <div className={cn("overflow-x-auto", usaCartoes && "max-md:hidden")}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {selecionavel && (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Selecionar todos da página"
                    checked={estadoCabecalho}
                    disabled={chavesPagina.length === 0}
                    onCheckedChange={alternarPagina}
                  />
                </TableHead>
              )}
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
                  {selecionavel && <TableCell className="w-10" />}
                  {colunasVisiveis.map((col) => (
                    <TableCell key={col.id ?? col.header} className={col.className}>
                      <Skeleton className="h-4 w-full max-w-36" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={colunasVisiveis.length + (selecionavel ? 1 : 0)}
                  className="h-40 text-center text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    {error ? (
                      <>
                        <TriangleAlert className="size-6 text-amber-500" />
                        {mensagemDeErro(error)}
                      </>
                    ) : (
                      <>
                        <Inbox className="size-6" />
                        {emptyMessage}
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              rows.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  onClick={(e) => {
                    // Menu de ações, confirmação e diálogos abrem em portal: no
                    // DOM estão fora da linha, mas no React o clique sobe até
                    // ela. Sem isto, "Excluir" também abria o registro — que
                    // acabou de ser excluído ("não encontrado").
                    if (!e.currentTarget.contains(e.target as Node)) return;
                    onRowClick?.(row);
                  }}
                  className={cn(onRowClick && "cursor-pointer", rowClassName?.(row))}
                  data-state={selecionavel && selectedKeys!.includes(rowKey(row)) ? "selected" : undefined}
                >
                  {selecionavel && (
                    // Célula inteira clicável e sem abrir o registro: errar o
                    // quadradinho por um pixel não deve navegar.
                    <TableCell
                      className="w-10"
                      title={rowSelectionBlocked?.(row) ?? undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!rowSelectionBlocked?.(row)) alternarLinha(rowKey(row));
                      }}
                    >
                      <Checkbox
                        aria-label="Selecionar linha"
                        checked={selectedKeys!.includes(rowKey(row))}
                        disabled={!!rowSelectionBlocked?.(row)}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={() => alternarLinha(rowKey(row))}
                      />
                    </TableCell>
                  )}
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

      <Paginacao
        className="border-t border-border/60 px-4 py-2.5"
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}
