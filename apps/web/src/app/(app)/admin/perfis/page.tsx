"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Perfil } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { roleColorClass } from "@/lib/role-color";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, ShieldCheck, Trash2 } from "lucide-react";

type SimNaoTodos = "todos" | "sim" | "nao";

export default function PerfisPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("nome");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("todos");
  const [sistemaBase, setSistemaBase] = useState<SimNaoTodos>("todos");

  const { data, isLoading, isFetching, refetch } = useResourceList<Perfil>("perfis", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    ...(sistemaBase !== "todos" ? { sistemaBase: sistemaBase === "sim" } : {}),
  });
  const { remove } = useResourceMutations("perfis");

  const filtrosAtivos = sistemaBase !== "todos";
  const limparFiltros = () => {
    setSistemaBase("todos");
    setPage(1);
  };

  const openEdit = (p: Perfil) => router.push(`/admin/perfis/${p.id}`);
  const openPermissoes = (p: Perfil) => router.push(`/admin/perfis/${p.id}?tab=permissoes`);

  const onDelete = async (perfil: Perfil) => {
    if (perfil.sistemaBase) {
      toast.error("Perfis base do sistema não podem ser excluídos");
      return;
    }
    if (!confirm(`Excluir o perfil "${perfil.nome}"?`)) return;
    try {
      await remove.mutateAsync(perfil.id);
      toast.success("Perfil excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir perfil");
    }
  };

  const columns: ColumnDef<Perfil>[] = [
    {
      header: "Nome",
      sortKey: "nome",
      cell: (p) => (
        <div className="flex items-center gap-2">
          <Badge className={roleColorClass(p.nome)} variant="outline">
            {p.nome}
          </Badge>
          {p.sistemaBase && (
            <span className="text-xs text-muted-foreground">Base do sistema</span>
          )}
        </div>
      ),
    },
    { header: "Descrição", cell: (p) => p.descricao ?? "—" },
    { header: "Status", sortKey: "ativo", cell: (p) => <StatusDot active={p.ativo} /> },
    {
      header: "",
      className: "w-10",
      cell: (p) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openPermissoes(p)}>
              <ShieldCheck className="size-4" /> Permissões
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openEdit(p)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(p)}>
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
        onCreate={() => router.push("/admin/perfis/novo")}
        createLabel="Novo perfil"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusQuickFilter
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <FiltersPopover active={filtrosAtivos} onClear={limparFiltros}>
          <div className="space-y-2">
            <FieldLabel>Base do sistema</FieldLabel>
            <Select
              value={sistemaBase}
              onValueChange={(v) => {
                setSistemaBase(v as SimNaoTodos);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="nao">Não</SelectItem>
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
