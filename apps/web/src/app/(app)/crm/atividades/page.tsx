"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Atividade, TipoAtividade, Vendedor } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { apiFetch, ApiError } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { QuickFilterButton, QuickFilterGroup } from "@/components/crud/quick-filter-group";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { TIPOS, TIPO_LABEL } from "@/components/crud/atividade-tipo";
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
import { AlertTriangle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

type TipoFiltro = "todos" | TipoAtividade;

const dataBr = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

export default function AtividadesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("dataVencimento");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("ativos");
  const [tipo, setTipo] = useState<TipoFiltro>("todos");
  const [vendedorId, setVendedorId] = useState<string | undefined>(undefined);
  const [vencidas, setVencidas] = useState(false);

  const vendedoresEscopoQuery = useQuery({
    queryKey: ["clientes", "vendedores-escopo"],
    queryFn: () =>
      apiFetch<{ data: Vendedor[]; restrito: boolean; ehVendedorPuro: boolean }>(
        "/clientes/vendedores-escopo",
      ),
  });
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];
  const mostrarFiltroVendedor = !(vendedoresEscopoQuery.data?.ehVendedorPuro ?? false);

  const { data, isLoading, isFetching, refetch } = useResourceList<Atividade>("atividades", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    ...(tipo !== "todos" ? { tipo } : {}),
    ...(vendedorId ? { vendedorId } : {}),
    ...(vencidas ? { vencidas: true } : {}),
  });

  const { remove } = useResourceMutations("atividades");

  const abrirEdicao = (a: Atividade) => router.push(`/crm/atividades/${a.id}`);

  const onDelete = async (a: Atividade) => {
    if (!confirm(`Excluir a atividade "${a.titulo}"?`)) return;
    try {
      await remove.mutateAsync(a.id);
      toast.success("Atividade excluída");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir atividade");
    }
  };

  const filtrosAtivos = tipo !== "todos" || !!vendedorId;
  const limparFiltros = () => {
    setTipo("todos");
    setVendedorId(undefined);
    setPage(1);
  };

  const agora = new Date().getTime();
  const estaVencida = (a: Atividade) =>
    !a.concluida && !!a.dataVencimento && new Date(a.dataVencimento).getTime() < agora;

  const columns: ColumnDef<Atividade>[] = [
    { header: "Título", sortKey: "titulo", cell: (a) => <p className="font-medium">{a.titulo}</p> },
    { header: "Tipo", sortKey: "tipo", cell: (a) => TIPO_LABEL[a.tipo] },
    {
      header: "Cliente",
      cell: (a) => (
        <span className="text-xs">{a.cliente ? a.cliente.nomeFantasia || a.cliente.razaoSocial : "—"}</span>
      ),
    },
    {
      header: "Vendedor",
      cell: (a) => <span className="text-xs">{a.vendedor.nomeReduzido || a.vendedor.nome}</span>,
    },
    {
      header: "Vencimento",
      sortKey: "dataVencimento",
      cell: (a) => (
        <span className={estaVencida(a) ? "flex items-center gap-1 text-destructive" : undefined}>
          {estaVencida(a) && <AlertTriangle className="size-3.5" />}
          {dataBr(a.dataVencimento)}
        </span>
      ),
    },
    {
      header: "Situação",
      sortKey: "concluida",
      cell: (a) =>
        a.concluida ? <Badge variant="outline">Concluída</Badge> : <Badge>Pendente</Badge>,
    },
    { header: "Status", sortKey: "ativo", cell: (a) => <StatusDot active={a.ativo} /> },
    {
      header: "",
      className: "w-10",
      cell: (a) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => abrirEdicao(a)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(a)}>
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
        onCreate={() => router.push("/crm/atividades/novo")}
        createLabel="Nova atividade"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusQuickFilter
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          />
          <QuickFilterGroup>
            <QuickFilterButton
              active={vencidas}
              onClick={() => {
                setVencidas((v) => !v);
                setPage(1);
              }}
            >
              <AlertTriangle className="size-3.5" />
              Vencidas
            </QuickFilterButton>
          </QuickFilterGroup>
        </div>
        <FiltersPopover active={filtrosAtivos} onClear={limparFiltros}>
          <div className="space-y-2">
            <FieldLabel>Tipo</FieldLabel>
            <Select
              value={tipo}
              onValueChange={(v) => {
                setTipo(v as TipoFiltro);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {TIPOS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mostrarFiltroVendedor && (
            <div className="space-y-2">
              <FieldLabel>Vendedor</FieldLabel>
              <Select
                value={vendedorId ?? "none"}
                onValueChange={(v) => {
                  setVendedorId(v === "none" ? undefined : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Qualquer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Qualquer</SelectItem>
                  {opcoesVendedor.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nomeReduzido || v.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </FiltersPopover>
      </div>

      <EntityTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(a) => a.id}
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
        onRowClick={abrirEdicao}
        emptyMessage="Nenhuma atividade cadastrada."
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(key, order) => {
          setSortBy(key);
          setSortOrder(order);
        }}
        storageKey="atividades"
      />
    </div>
  );
}
