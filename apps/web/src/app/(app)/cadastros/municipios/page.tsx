"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Estado, Municipio } from "@plataforma/contracts";
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

type MunicipioRow = Municipio & { estado?: { id: string; sigla: string } | null };

export default function MunicipiosPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("descricao");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("todos");
  const [estadoId, setEstadoId] = useState<string | undefined>(undefined);

  const estadosQuery = useQuery({
    queryKey: ["estados", "select"],
    queryFn: () =>
      apiFetch<{ data: Estado[] }>("/estados", { query: { pageSize: 100, sortBy: "sigla" } }),
  });

  const { data, isLoading, isFetching, refetch, error } = useResourceList<MunicipioRow>("municipios", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    ...(estadoId ? { estadoId } : {}),
  });

  const { remove } = useResourceMutations("municipios");

  const openEdit = (m: MunicipioRow) => router.push(`/cadastros/municipios/${m.id}`);

  const onDelete = async (m: MunicipioRow) => {
    if (!confirm(`Excluir o município "${m.descricao}"?`)) return;
    try {
      await remove.mutateAsync(m.id);
      toast.success("Município excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir município");
    }
  };

  const columns: ColumnDef<MunicipioRow>[] = [
    { header: "Descrição", sortKey: "descricao", cell: (m) => <p className="font-medium">{m.descricao}</p> },
    { header: "UF", cell: (m) => <span className="text-xs">{m.estado?.sigla ?? "—"}</span> },
    {
      header: "Cód. ERP",
      sortKey: "codigoErp",
      cell: (m) => <span className="font-mono text-xs">{m.codigoErp || "—"}</span>,
    },
    {
      header: "IBGE",
      sortKey: "codigoIbge",
      cell: (m) => <span className="font-mono text-xs">{m.codigoIbge || "—"}</span>,
    },
    { header: "Status", sortKey: "ativo", cell: (m) => <StatusDot active={m.ativo} /> },
    {
      header: "",
      className: "w-10",
      cell: (m) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(m)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(m)}>
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
        onCreate={() => router.push("/cadastros/municipios/novo")}
        createLabel="Novo município"
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
        rowKey={(m) => m.id}
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
        onRowClick={openEdit}
        emptyMessage="Nenhum município cadastrado."
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
