"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TabelaPreco } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";

const dateLabel = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

export default function TabelasPrecoPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("descricao");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("ativos");

  const { data, isLoading, isFetching, refetch } = useResourceList<TabelaPreco>("tabelas-preco", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
  });

  const abrirDetalhe = (t: TabelaPreco) => router.push(`/cadastros/tabelas-preco/${t.id}`);

  const columns: ColumnDef<TabelaPreco>[] = [
    { header: "Descrição", sortKey: "descricao", cell: (t) => <p className="font-medium">{t.descricao}</p> },
    {
      header: "Código",
      sortKey: "codigoErp",
      cell: (t) => <span className="font-mono text-xs">{t.codigoErp}</span>,
    },
    {
      header: "Vigência",
      sortKey: "dtInicio",
      cell: (t) => (
        <span className="text-xs">
          {dateLabel(t.dtInicio)} – {t.dtFim ? dateLabel(t.dtFim) : "sem fim"}
        </span>
      ),
    },
    { header: "Status", sortKey: "ativo", cell: (t) => <StatusDot active={t.ativo} /> },
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
        rowKey={(t) => t.id}
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
        onRowClick={abrirDetalhe}
        emptyMessage="Nenhuma tabela de preço cadastrada."
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
