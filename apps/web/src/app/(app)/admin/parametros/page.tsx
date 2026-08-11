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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

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
      toast.success("Parâmetro excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir parâmetro");
    }
  };

  const columns: ColumnDef<ParametroEmpresa>[] = [
    {
      header: "Parâmetro",
      sortKey: "parametro",
      cell: (p) => <span className="font-mono text-xs font-medium">{p.parametro}</span>,
    },
    {
      header: "Tipo",
      sortKey: "tipo",
      className: "w-28",
      cell: (p) => <Badge variant="outline">{TIPO_PARAMETRO_LABEL[p.tipo]}</Badge>,
    },
    {
      header: "Tam.",
      className: "w-16 text-right",
      cell: (p) => p.tamanho ?? "—",
    },
    {
      header: "Conteúdo",
      cell: (p) => <span className="font-medium">{conteudoLegivel(p)}</span>,
    },
    {
      header: "Descrição",
      cell: (p) => <span className="text-xs text-muted-foreground">{p.descricao || "—"}</span>,
    },
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
            <DropdownMenuItem onClick={() => abrirEdicao(p)}>
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
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Parâmetros</h1>
        <p className="text-sm text-muted-foreground">
          Configurações do sistema para a empresa ativa. Cada empresa tem seu próprio conjunto.
        </p>
      </div>

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
          // key força o formulário a reiniciar com os valores da linha aberta
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
