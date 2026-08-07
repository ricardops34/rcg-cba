"use client";

import { useState } from "react";
import type { TabelaPrecoItem } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { Input } from "@/components/ui/input";
import { regraDescontoLabel } from "@/lib/regra-desconto";

const formatarMoeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Somente leitura: itens entram pelo import (e no futuro pela API externa de
// manutenção), não por esta tela.
export function TabelaPrecoItensTable({ tabelaPrecoId }: { tabelaPrecoId: string }) {
  const resource = `tabelas-preco/${tabelaPrecoId}/itens`;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("descricao");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("ativos");

  const { data, isLoading } = useResourceList<TabelaPrecoItem>(resource, {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
  });

  const columns: ColumnDef<TabelaPrecoItem>[] = [
    {
      header: "Código",
      sortKey: "codigoErp",
      cell: (i) => <span className="font-mono text-xs">{i.produto.codigoErp}</span>,
    },
    {
      header: "Produto",
      sortKey: "descricao",
      cell: (i) => <p className="font-medium">{i.produto.descricao}</p>,
    },
    {
      header: "Unid.",
      sortKey: "unidade",
      cell: (i) => <span className="text-xs">{i.produto.unidade || "—"}</span>,
    },
    { header: "Preço", sortKey: "preco", cell: (i) => formatarMoeda(i.preco) },
    {
      header: "Regra de desconto",
      cell: (i) => <span className="text-xs">{regraDescontoLabel(i.regraDesconto)}</span>,
    },
    { header: "Status", sortKey: "ativo", cell: (i) => <StatusDot active={i.ativo} /> },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          placeholder="Buscar produto por código ou descrição..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-sm"
        />
        <StatusQuickFilter
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </div>

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(i) => i.id}
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
        emptyMessage="Nenhum item cadastrado nesta tabela de preço."
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
