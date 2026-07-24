"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Armazem, Estoque } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { apiFetch } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type EstoqueRow = Estoque & {
  produto?: { id: string; codigoErp: string; descricao: string; unidade: string | null } | null;
  armazem?: { id: string; codigoErp: string; descricao: string } | null;
};

const moeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const dataBr = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

// Consulta read-only: os saldos entram pelo import do ERP.
export default function EstoquePage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [armazemId, setArmazemId] = useState<string | undefined>(undefined);
  const [comSaldo, setComSaldo] = useState<"todos" | "sim" | "nao">("todos");

  const armazensQuery = useQuery({
    queryKey: ["armazens", "select"],
    queryFn: () => apiFetch<{ data: Armazem[] }>("/armazens", { query: { pageSize: 100 } }),
  });

  const { data, isLoading, isFetching, refetch } = useResourceList<EstoqueRow>("estoque", {
    search,
    page,
    pageSize,
    ...(sortBy ? { sortBy, sortOrder } : {}),
    ...(armazemId ? { armazemId } : {}),
    ...(comSaldo !== "todos" ? { comSaldo: comSaldo === "sim" } : {}),
  });

  const filtrosAtivos = !!armazemId || comSaldo !== "todos";
  const limparFiltros = () => {
    setArmazemId(undefined);
    setComSaldo("todos");
    setPage(1);
  };

  const columns: ColumnDef<EstoqueRow>[] = [
    {
      header: "Produto",
      cell: (e) => (
        <div>
          <p className="font-medium">{e.produto?.descricao ?? "—"}</p>
          <p className="font-mono text-xs text-muted-foreground">{e.produto?.codigoErp}</p>
        </div>
      ),
    },
    { header: "Armazém", cell: (e) => <span className="text-xs">{e.armazem?.descricao ?? "—"}</span> },
    {
      header: "Saldo",
      sortKey: "saldo",
      cell: (e) => (
        <span className={e.saldo > 0 ? "" : "text-muted-foreground"}>
          {e.saldo.toLocaleString("pt-BR")}
          {e.produto?.unidade && <span className="text-xs text-muted-foreground"> {e.produto.unidade}</span>}
        </span>
      ),
    },
    {
      header: "Reserva",
      sortKey: "reserva",
      cell: (e) => (e.reserva != null ? e.reserva.toLocaleString("pt-BR") : "—"),
    },
    { header: "Custo", sortKey: "custo", cell: (e) => moeda(e.custo) },
    { header: "Últ. preço", sortKey: "ultimoPreco", cell: (e) => moeda(e.ultimoPreco) },
    { header: "Últ. compra", sortKey: "ultimaCompra", cell: (e) => dataBr(e.ultimaCompra) },
  ];

  return (
    <div className="space-y-4">
      <CrudHeader
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      <div className="flex flex-wrap items-center justify-end gap-2">
        <FiltersPopover active={filtrosAtivos} onClear={limparFiltros}>
          <div className="space-y-2">
            <FieldLabel>Armazém</FieldLabel>
            <Select
              value={armazemId ?? "none"}
              onValueChange={(v) => {
                setArmazemId(v === "none" ? undefined : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Todos</SelectItem>
                {(armazensQuery.data?.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <FieldLabel>Com saldo</FieldLabel>
            <Select
              value={comSaldo}
              onValueChange={(v) => {
                setComSaldo(v as "todos" | "sim" | "nao");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="sim">Com saldo</SelectItem>
                <SelectItem value="nao">Sem saldo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FiltersPopover>
      </div>

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(e) => e.id}
        isLoading={isLoading}
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? pageSize}
        total={data?.total ?? 0}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        emptyMessage="Nenhum registro de estoque."
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(key, order) => {
          setSortBy(key);
          setSortOrder(order);
        }}
      />
    </div>
  );
}
