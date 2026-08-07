"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { RegraDesconto } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

const percentual = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export default function RegrasDescontoPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("descricao");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("ativos");

  const { data, isLoading, isFetching, refetch, error } = useResourceList<RegraDesconto>(
    "regras-desconto",
    {
      search,
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    },
  );

  const { remove } = useResourceMutations("regras-desconto");

  const abrirEdicao = (r: RegraDesconto) => router.push(`/cadastros/regras-desconto/${r.id}`);

  const onDelete = async (r: RegraDesconto) => {
    if (!confirm(`Excluir a regra "${r.descricao}"?`)) return;
    try {
      await remove.mutateAsync(r.id);
      toast.success("Regra excluída");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir regra");
    }
  };

  const columns: ColumnDef<RegraDesconto>[] = [
    {
      header: "Código",
      sortKey: "codigoErp",
      className: "w-24",
      cell: (r) => <span className="font-mono text-xs">{r.codigoErp || "—"}</span>,
    },
    {
      header: "Descrição",
      sortKey: "descricao",
      cell: (r) => (
        <div className="flex items-center gap-2">
          <p className="font-medium">{r.descricao}</p>
          {r.padrao && <Badge variant="secondary">Padrão</Badge>}
        </div>
      ),
    },
    {
      header: "% Desc. autorizado",
      sortKey: "percDescontoAutorizado",
      className: "text-right",
      cell: (r) => percentual(r.percDescontoAutorizado),
    },
    {
      header: "% Desc. máximo",
      sortKey: "percDescontoMaximo",
      className: "text-right",
      cell: (r) => percentual(r.percDescontoMaximo),
    },
    {
      header: "Comissão",
      sortKey: "percComissao",
      className: "text-right",
      cell: (r) => percentual(r.percComissao),
    },
    {
      header: "Faixas",
      className: "text-right",
      cell: (r) => r.faixas.length,
    },
    { header: "Status", sortKey: "ativo", cell: (r) => <StatusDot active={r.ativo} /> },
    {
      header: "",
      className: "w-10",
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => abrirEdicao(r)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(r)}>
              <Trash2 className="size-4" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
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
        onCreate={() => router.push("/cadastros/regras-desconto/nova")}
        createLabel="Nova regra"
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
        rowKey={(r) => r.id}
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
        onRowClick={abrirEdicao}
        emptyMessage="Nenhuma regra de desconto cadastrada."
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(key, order) => {
          setSortBy(key);
          setSortOrder(order);
        }}
        storageKey="regras-desconto"
      />
    </div>
  );
}
