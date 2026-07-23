"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Perfil, Usuario } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
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
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

interface UsuarioRow extends Usuario {
  perfil: { id: string; nome: string } | null;
}

export default function UsuariosPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("nome");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("todos");
  const [perfilId, setPerfilId] = useState<string | undefined>(undefined);

  const perfisQuery = useQuery({
    queryKey: ["perfis", "select"],
    queryFn: () => apiFetch<{ data: Perfil[] }>("/perfis", { query: { pageSize: 100 } }),
  });

  const { data, isLoading, isFetching, refetch } = useResourceList<UsuarioRow>("usuarios", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    ...(perfilId ? { perfilId } : {}),
  });

  const { remove } = useResourceMutations("usuarios");

  const openEdit = (usuario: UsuarioRow) => router.push(`/admin/usuarios/${usuario.id}`);

  const onDelete = async (usuario: UsuarioRow) => {
    if (!confirm(`Excluir o usuário "${usuario.nome}"?`)) return;
    try {
      await remove.mutateAsync(usuario.id);
      toast.success("Usuário excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir usuário");
    }
  };

  const filtrosAtivos = !!perfilId;
  const limparFiltros = () => {
    setPerfilId(undefined);
    setPage(1);
  };

  const columns: ColumnDef<UsuarioRow>[] = [
    { header: "Nome", sortKey: "nome", cell: (u) => <span className="font-medium">{u.nome}</span> },
    { header: "E-mail", sortKey: "email", cell: (u) => u.email },
    {
      header: "Perfil",
      cell: (u) =>
        u.perfil ? (
          <Badge className={roleColorClass(u.perfil.nome)} variant="outline">
            {u.perfil.nome}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { header: "Status", sortKey: "ativo", cell: (u) => <StatusDot active={u.ativo} /> },
    {
      header: "Último acesso",
      sortKey: "ultimoLogin",
      cell: (u) =>
        u.ultimoLogin ? (
          <span className="text-sm text-muted-foreground">
            {new Date(u.ultimoLogin).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Nunca</span>
        ),
    },
    {
      header: "",
      className: "w-10",
      cell: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(u)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(u)}>
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
        onCreate={() => router.push("/admin/usuarios/novo")}
        createLabel="Novo usuário"
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
            <FieldLabel>Perfil</FieldLabel>
            <Select
              value={perfilId ?? "none"}
              onValueChange={(v) => {
                setPerfilId(v === "none" ? undefined : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Qualquer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Qualquer</SelectItem>
                {(perfisQuery.data?.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
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
        rowKey={(u) => u.id}
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
