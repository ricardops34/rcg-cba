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
import { Card, CardContent } from "@/components/ui/card";
import { FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  UserCheck,
  UserX,
  ShieldCheck,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

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

  const { data, isLoading, isFetching, refetch, error } = useResourceList<UsuarioRow>("usuarios", {
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

  const usuarios = data?.data ?? [];
  const totalUsuarios = data?.total ?? usuarios.length;
  const totalAtivos = usuarios.filter((u) => u.ativo).length;
  const totalInativos = usuarios.filter((u) => !u.ativo).length;
  const perfisCount = perfisQuery.data?.data.length ?? 0;

  const columns: ColumnDef<UsuarioRow>[] = [
    {
      header: "Usuário",
      sortKey: "nome",
      cell: (u) => (
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
            {u.nome.charAt(0).toUpperCase()}
          </div>
          <div>
            <span className="font-medium text-foreground text-sm block">{u.nome}</span>
            <span className="text-xs text-muted-foreground font-mono">{u.email}</span>
          </div>
        </div>
      ),
    },
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
          <span className="text-xs font-mono text-muted-foreground">
            {new Date(u.ultimoLogin).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Nunca acessou</span>
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
    <div className="space-y-6">
      {/* Superior Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
            <Users className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Cadastro de Usuários</h1>
              <Badge variant="outline" className="text-xs">RBAC & Hierarquia</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Gerencie usuários da empresa, vínculos de perfil de acesso, hierarquia comercial e restrições.
            </p>
          </div>
        </div>
        <Button onClick={() => router.push("/admin/usuarios/novo")} className="gap-2 shadow-xs">
          <Plus className="size-4" /> Novo usuário
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-xs border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total de Usuários</p>
              <p className="text-2xl font-bold tracking-tight mt-1">{totalUsuarios}</p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Usuários Ativos</p>
              <p className="text-2xl font-bold tracking-tight mt-1 text-emerald-600 dark:text-emerald-400">
                {totalAtivos}
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <UserCheck className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Inativos / Bloqueados</p>
              <p className="text-2xl font-bold tracking-tight mt-1 text-muted-foreground">
                {totalInativos}
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <UserX className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Perfis Disponíveis</p>
              <p className="text-2xl font-bold tracking-tight mt-1 text-purple-600 dark:text-purple-400">
                {perfisCount}
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
              <ShieldCheck className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      <CrudHeader
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        placeholder="Buscar por nome ou e-mail..."
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
            <FieldLabel>Perfil de acesso</FieldLabel>
            <Select
              value={perfilId ?? "none"}
              onValueChange={(v) => {
                setPerfilId(v === "none" ? undefined : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Qualquer perfil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Qualquer perfil</SelectItem>
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
        error={error}
        emptyMessage="Nenhum usuário encontrado com os filtros aplicados."
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

