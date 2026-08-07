"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CondicaoPagamento } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";

export default function CondicoesPagamentoPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("descricao");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("ativos");

  const { data, isLoading, isFetching, refetch, error } = useResourceList<CondicaoPagamento>(
    "condicoes-pagamento",
    {
      search,
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    },
  );

  const abrirDetalhe = (c: CondicaoPagamento) => router.push(`/cadastros/condicoes-pagamento/${c.id}`);

  const columns: ColumnDef<CondicaoPagamento>[] = [
    { header: "Descrição", sortKey: "descricao", cell: (c) => <p className="font-medium">{c.descricao}</p> },
    {
      header: "Código",
      sortKey: "codigoErp",
      cell: (c) => <span className="font-mono text-xs">{c.codigoErp}</span>,
    },
    { header: "Forma", sortKey: "forma", cell: (c) => <span className="text-xs">{c.forma || "—"}</span> },
    { header: "Status", sortKey: "ativo", cell: (c) => <StatusDot active={c.ativo} /> },
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

      <StatusQuickFilter
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
      />

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(c) => c.id}
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
        onRowClick={abrirDetalhe}
        emptyMessage="Nenhuma condição de pagamento cadastrada."
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
