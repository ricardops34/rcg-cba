"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Perfil } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import {
  StatusQuickFilter,
  type StatusFilterValue,
} from "@/components/crud/status-quick-filter";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { roleColorClass } from "@/lib/role-color";
import { useAuthStore } from "@/stores/auth-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ShieldCheck,
  Shield,
  Lock,
  CheckCircle2,
  Plus,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
} from "lucide-react";

type SimNaoTodos = "todos" | "sim" | "nao";

export default function PerfisPage() {
  const router = useRouter();
  const administradorPlataforma = useAuthStore((s) => s.user?.administradorPlataforma === true);
  // Perfil da plataforma vale para todas as empresas: só o administrador dela altera.
  const podeAlterar = (p: Perfil) => administradorPlataforma || p.grupoEconomicoId !== null;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("nome");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("todos");
  const [sistemaBase, setSistemaBase] = useState<SimNaoTodos>("todos");

  const { data, isLoading, isFetching, refetch, error } =
    useResourceList<Perfil>("perfis", {
      search,
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
      ...(sistemaBase !== "todos"
        ? { sistemaBase: sistemaBase === "sim" }
        : {}),
    });
  const { remove } = useResourceMutations("perfis");
  const queryClient = useQueryClient();

  // Copiar: pede o nome do novo perfil e abre a matriz dele, para ajustar.
  const [copiando, setCopiando] = useState<Perfil | null>(null);
  const [nomeCopia, setNomeCopia] = useState("");
  const copiar = useMutation({
    mutationFn: ({ id, nome }: { id: string; nome: string }) =>
      apiFetch<Perfil>(`/perfis/${id}/copiar`, { method: "POST", body: { nome } }),
    onSuccess: (novo) => {
      void queryClient.invalidateQueries({ queryKey: ["perfis"] });
      toast.success("Perfil copiado. Ajuste as permissões do novo perfil.");
      setCopiando(null);
      router.push(`/admin/perfis/${novo.id}?tab=permissoes`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Erro ao copiar o perfil"),
  });

  const filtrosAtivos = sistemaBase !== "todos";
  const limparFiltros = () => {
    setSistemaBase("todos");
    setPage(1);
  };

  const perfis = data?.data ?? [];
  const totalPerfis = data?.total ?? perfis.length;
  const totalBaseSistema = perfis.filter((p) => p.sistemaBase).length;
  const totalPersonalizados = perfis.filter((p) => !p.sistemaBase).length;
  const totalAtivos = perfis.filter((p) => p.ativo).length;

  const openEdit = (p: Perfil) => router.push(`/admin/perfis/${p.id}`);
  const openPermissoes = (p: Perfil) =>
    router.push(`/admin/perfis/${p.id}?tab=permissoes`);

  const onDelete = async (perfil: Perfil) => {
    if (perfil.sistemaBase) {
      toast.error("Perfis base do sistema não podem ser excluídos");
      return;
    }
    if (!confirm(`Excluir o perfil "${perfil.nome}"?`)) return;
    try {
      await remove.mutateAsync(perfil.id);
      toast.success("Perfil excluído com sucesso");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Erro ao excluir perfil",
      );
    }
  };

  const columns: ColumnDef<Perfil>[] = [
    {
      header: "Perfil",
      sortKey: "nome",
      cell: (p) => (
        <div className="flex items-center gap-2">
          <Badge className={roleColorClass(p.nome)} variant="outline">
            {p.nome}
          </Badge>
          {p.sistemaBase && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Lock className="size-2.5" /> Base do sistema
            </Badge>
          )}
          {p.administraPlataforma && (
            <Badge
              variant="outline"
              className="text-[10px] border-purple-500/40 text-purple-600 dark:text-purple-400"
            >
              Plataforma
            </Badge>
          )}
          {administradorPlataforma && p.grupoEconomicoId !== null && (
            <Badge variant="outline" className="text-[10px]">
              Do grupo
            </Badge>
          )}
          {!podeAlterar(p) && !p.sistemaBase && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Lock className="size-2.5" /> Padrão da plataforma
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: "Descrição",
      cell: (p) => (
        <span className="text-xs text-muted-foreground">
          {p.descricao ?? "—"}
        </span>
      ),
    },
    {
      header: "Status",
      sortKey: "ativo",
      cell: (p) => <StatusDot active={p.ativo} />,
    },
    {
      header: "",
      className: "w-10",
      cell: (p) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={(ev) => ev.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openPermissoes(p)}>
              <ShieldCheck className="size-4" /> Matriz de Permissões
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openEdit(p)}>
              <Pencil className="size-4" /> {podeAlterar(p) ? "Editar perfil" : "Ver perfil"}
            </DropdownMenuItem>
            {!p.sistemaBase && (
              <DropdownMenuItem
                onClick={() => {
                  setCopiando(p);
                  setNomeCopia(`Cópia de ${p.nome}`);
                }}
              >
                <Copy className="size-4" /> Copiar perfil
              </DropdownMenuItem>
            )}
            {!p.sistemaBase && podeAlterar(p) && (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete(p)}
              >
                <Trash2 className="size-4" /> Excluir perfil
              </DropdownMenuItem>
            )}
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
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">
                Perfis de Acesso (RBAC)
              </h1>
              <Badge variant="outline" className="text-xs">
                Segurança e Permissões
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure perfis de acesso, permissões granulares por rotina e
              regras de segurança da empresa.
            </p>
          </div>
        </div>
        <Button
          onClick={() => router.push("/admin/perfis/novo")}
          className="gap-2 shadow-xs"
        >
          <Plus className="size-4" /> Novo perfil
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-xs border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Total de Perfis
              </p>
              <p className="text-2xl font-bold tracking-tight mt-1">
                {totalPerfis}
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Shield className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Base do Sistema
              </p>
              <p className="text-2xl font-bold tracking-tight mt-1 text-purple-600 dark:text-purple-400">
                {totalBaseSistema}
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
              <Lock className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Personalizados
              </p>
              <p className="text-2xl font-bold tracking-tight mt-1 text-blue-600 dark:text-blue-400">
                {totalPersonalizados}
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <ShieldCheck className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Perfis Ativos
              </p>
              <p className="text-2xl font-bold tracking-tight mt-1 text-emerald-600 dark:text-emerald-400">
                {totalAtivos}
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="size-5" />
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
        placeholder="Buscar por nome do perfil..."
        actions={
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
                  <SelectItem value="todos">Todos os perfis</SelectItem>
                  <SelectItem value="sim">Somente base do sistema</SelectItem>
                  <SelectItem value="nao">Somente personalizados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </FiltersPopover>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
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
        rowKey={(p) => p.id}
        isLoading={isLoading}
        error={error}
        emptyMessage="Nenhum perfil encontrado com os filtros aplicados."
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

      <Dialog open={!!copiando} onOpenChange={(aberto) => !aberto && setCopiando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copiar perfil</DialogTitle>
            <DialogDescription>
              Cria um perfil novo com as mesmas permissões, rotina inicial e
              alcance de carteira de &quot;{copiando?.nome}&quot;. Depois é só
              ajustar o que for diferente.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            maxLength={80}
            value={nomeCopia}
            onChange={(e) => setNomeCopia(e.target.value)}
            placeholder="Nome do novo perfil"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCopiando(null)}>
              Cancelar
            </Button>
            <Button
              disabled={nomeCopia.trim().length < 2 || copiar.isPending}
              onClick={() => copiando && copiar.mutate({ id: copiando.id, nome: nomeCopia.trim() })}
            >
              {copiar.isPending ? "Copiando..." : "Copiar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
