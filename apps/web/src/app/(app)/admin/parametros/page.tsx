"use client";

import { useState } from "react";
import { toast } from "sonner";
import { TIPO_PARAMETRO_LABEL, type ParametroEmpresa } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { ParametroFormDialog } from "@/components/crud/parametro-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, Sliders, CheckCircle2, LockKeyhole, Plus } from "lucide-react";

/** Conteúdo como o usuário lê: senha mascarada, booleano em Sim/Não. */
function conteudoLegivel(p: ParametroEmpresa) {
  if (p.tipo === "senha") return p.preenchido ? "••••••••" : "—";
  if (p.conteudo == null || p.conteudo === "") return "—";
  if (p.tipo === "booleano") return p.conteudo === "true" ? "Sim" : "Não";
  return p.conteudo;
}

export default function ParametrosPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState("parametro");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("ativos");
  const [emEdicao, setEmEdicao] = useState<ParametroEmpresa | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);

  const { data, isLoading, isFetching, refetch, error } = useResourceList<ParametroEmpresa>(
    "parametros",
    {
      search,
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    },
  );

  const { remove } = useResourceMutations("parametros");

  const abrirEdicao = (p: ParametroEmpresa) => {
    setEmEdicao(p);
    setDialogAberto(true);
  };

  const onDelete = async (p: ParametroEmpresa) => {
    if (!confirm(`Excluir o parâmetro "${p.parametro}"?`)) return;
    try {
      await remove.mutateAsync(p.id);
      toast.success("Parâmetro excluído com sucesso");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir parâmetro");
    }
  };

  const totalParametros = data?.total ?? 0;
  const parametrosLista = data?.data ?? [];
  const totalAtivos = parametrosLista.filter((p) => p.ativo).length;
  const totalPreenchidos = parametrosLista.filter((p) => p.preenchido || (p.conteudo && p.conteudo !== "")).length;

  const columns: ColumnDef<ParametroEmpresa>[] = [
    {
      header: "Parâmetro",
      sortKey: "parametro",
      cell: (p) => (
        <div className="space-y-0.5">
          <span className="font-mono text-xs font-semibold text-foreground">{p.parametro}</span>
        </div>
      ),
    },
    {
      header: "Tipo",
      sortKey: "tipo",
      className: "w-28",
      cell: (p) => (
        <Badge variant="outline" className="text-xs font-medium">
          {TIPO_PARAMETRO_LABEL[p.tipo]}
        </Badge>
      ),
    },
    {
      header: "Tam.",
      className: "w-16 text-right",
      cell: (p) => <span className="font-mono text-xs text-muted-foreground">{p.tamanho ?? "—"}</span>,
    },
    {
      header: "Conteúdo",
      cell: (p) => (
        <span className={`font-medium text-xs ${p.tipo === "senha" ? "font-mono tracking-widest text-primary" : ""}`}>
          {conteudoLegivel(p)}
        </span>
      ),
    },
    {
      header: "Descrição",
      cell: (p) => <span className="text-xs text-muted-foreground line-clamp-1">{p.descricao || "—"}</span>,
    },
    { header: "Status", sortKey: "ativo", cell: (p) => <StatusDot active={p.ativo} /> },
    {
      header: "",
      className: "w-10",
      cell: (p) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => abrirEdicao(p)}>
              <Pencil className="mr-2 h-4 w-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(p)}>
              <Trash2 className="mr-2 h-4 w-4" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Parâmetros do Sistema</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as variáveis de configuração global e regras operacionais da empresa ativa.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEmEdicao(null);
            setDialogAberto(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Novo parâmetro
        </Button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Total de Parâmetros
              </p>
              <p className="text-2xl font-bold mt-1">{totalParametros}</p>
            </div>
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Sliders className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Parâmetros Ativos
              </p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {totalAtivos}
                </p>
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs">
                  Em uso
                </Badge>
              </div>
            </div>
            <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Valores Preenchidos
              </p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {totalPreenchidos}
                </p>
                <Badge variant="outline" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs">
                  Definidos
                </Badge>
              </div>
            </div>
            <div className="rounded-full bg-indigo-500/10 p-3 text-indigo-600 dark:text-indigo-400">
              <LockKeyhole className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Crud Header Filters */}
      <CrudHeader
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        onCreate={() => {
          setEmEdicao(null);
          setDialogAberto(true);
        }}
        createLabel="Novo parâmetro"
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
        rowKey={(p) => p.id}
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
        emptyMessage="Nenhum parâmetro cadastrado."
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(key, order) => {
          setSortBy(key);
          setSortOrder(order);
        }}
        storageKey="parametros"
      />

      {dialogAberto && (
        <ParametroFormDialog
          key={emEdicao?.id ?? "novo"}
          parametro={emEdicao}
          aberto={dialogAberto}
          onOpenChange={setDialogAberto}
          onSalvo={() => refetch()}
        />
      )}
    </div>
  );
}

