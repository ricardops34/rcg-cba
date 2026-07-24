"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Cep, Estado } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

type CepRow = Cep & {
  estado?: { id: string; sigla: string } | null;
  municipio?: { id: string; descricao: string } | null;
};

export default function CepsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("cep");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("todos");
  const [estadoId, setEstadoId] = useState<string | undefined>(undefined);

  const estadosQuery = useQuery({
    queryKey: ["estados", "select"],
    queryFn: () =>
      apiFetch<{ data: Estado[] }>("/estados", { query: { pageSize: 100, sortBy: "sigla" } }),
  });

  const { data, isLoading, isFetching, refetch } = useResourceList<CepRow>("ceps", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    ...(estadoId ? { estadoId } : {}),
  });

  const { remove } = useResourceMutations("ceps");

  const openEdit = (c: CepRow) => router.push(`/cadastros/ceps/${c.id}`);

  const onDelete = async (c: CepRow) => {
    if (!confirm(`Excluir o CEP "${c.cep}"?`)) return;
    try {
      await remove.mutateAsync(c.id);
      toast.success("CEP excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir CEP");
    }
  };

  const columns: ColumnDef<CepRow>[] = [
    {
      header: "CEP",
      sortKey: "cep",
      cell: (c) => <span className="font-mono font-medium">{c.cep}</span>,
    },
    { header: "Endereço", sortKey: "endereco", cell: (c) => c.endereco || "—" },
    { header: "Bairro", sortKey: "bairro", cell: (c) => <span className="text-xs">{c.bairro || "—"}</span> },
    {
      header: "Município/UF",
      cell: (c) => (
        <span className="text-xs">
          {c.municipio || c.estado
            ? [c.municipio?.descricao, c.estado?.sigla].filter(Boolean).join("/")
            : "—"}
        </span>
      ),
    },
    { header: "Status", sortKey: "ativo", cell: (c) => <StatusDot active={c.ativo} /> },
    {
      header: "",
      className: "w-10",
      cell: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(c)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(c)}>
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
        onCreate={() => router.push("/cadastros/ceps/novo")}
        createLabel="Novo CEP"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusQuickFilter
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <FiltersPopover
          active={!!estadoId}
          onClear={() => {
            setEstadoId(undefined);
            setPage(1);
          }}
        >
          <div className="space-y-2">
            <FieldLabel>Estado</FieldLabel>
            <Select
              value={estadoId ?? "none"}
              onValueChange={(v) => {
                setEstadoId(v === "none" ? undefined : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Todos</SelectItem>
                {(estadosQuery.data?.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.sigla} — {e.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FiltersPopover>
      </div>

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(c) => c.id}
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
        onRowClick={openEdit}
        emptyMessage="Nenhum CEP cadastrado."
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
