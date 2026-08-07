"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Armazem, EstoqueProdutoResumo } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { apiFetch } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const dataBr = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

// Consulta read-only: os saldos entram pelo import do ERP. Uma linha por
// produto, com o saldo somado em todos os armazéns (ou só no armazém
// filtrado); o detalhamento por armazém fica na tela de visualização.
export default function EstoquePage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("descricao");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [armazemId, setArmazemId] = useState<string | undefined>(undefined);
  const [comSaldo, setComSaldo] = useState<"todos" | "sim" | "nao">("todos");

  const armazensQuery = useQuery({
    queryKey: ["armazens", "select"],
    queryFn: () => apiFetch<{ data: Armazem[] }>("/armazens", { query: { pageSize: 100 } }),
  });

  const { data, isLoading, isFetching, refetch, error } = useResourceList<EstoqueProdutoResumo>("estoque", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(armazemId ? { armazemId } : {}),
    ...(comSaldo !== "todos" ? { comSaldo: comSaldo === "sim" } : {}),
  });

  const filtrosAtivos = !!armazemId || comSaldo !== "todos";
  const limparFiltros = () => {
    setArmazemId(undefined);
    setComSaldo("todos");
    setPage(1);
  };

  const columns: ColumnDef<EstoqueProdutoResumo>[] = [
    {
      header: "Código",
      sortKey: "codigoErp",
      cell: (p) => <span className="font-mono text-xs">{p.codigoErp}</span>,
    },
    {
      header: "Produto",
      sortKey: "descricao",
      cell: (p) => <p className="font-medium">{p.descricao}</p>,
    },
    {
      header: "Categoria",
      sortKey: "categoria",
      cell: (p) => p.categoria?.descricao ?? "—",
    },
    {
      header: "Armazéns",
      cell: (p) => <span className="text-xs text-muted-foreground">{p.qtdArmazens}</span>,
    },
    {
      header: "Saldo total",
      cell: (p) => (
        <span className={p.saldoTotal > 0 ? "" : "text-muted-foreground"}>
          {p.saldoTotal.toLocaleString("pt-BR")}
          {p.unidade && <span className="text-xs text-muted-foreground"> {p.unidade}</span>}
        </span>
      ),
    },
    {
      header: "Reserva total",
      cell: (p) => (p.reservaTotal != null ? p.reservaTotal.toLocaleString("pt-BR") : "—"),
    },
    { header: "Últ. compra", cell: (p) => dataBr(p.ultimaCompra) },
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
        rowKey={(p) => p.id}
        isLoading={isLoading}
        error={error}
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? pageSize}
        total={data?.total ?? 0}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        onRowClick={(p) => router.push(`/comercial/estoque/${p.id}`)}
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
