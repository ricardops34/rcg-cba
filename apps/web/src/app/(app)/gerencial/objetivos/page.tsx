"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ObjetivoVendedorMes } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { useVendedoresEscopo, vendedorFiltroLabel } from "@/hooks/use-vendedores-escopo";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { ObjetivoCopiarDialog } from "@/components/crud/objetivo-copiar-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

const MES_ABREV = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ObjetivosPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("ano");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [status, setStatus] = useState<StatusFilterValue>("todos");
  const [ano, setAno] = useState("");
  const [mes, setMes] = useState<string | undefined>(undefined);
  const [vendedorId, setVendedorId] = useState<string | undefined>(undefined);

  const vendedoresEscopoQuery = useVendedoresEscopo();
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];

  const { data, isLoading, isFetching, refetch, error } = useResourceList<ObjetivoVendedorMes>("objetivos", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    ...(ano && /^\d{4}$/.test(ano) ? { ano: Number(ano) } : {}),
    ...(mes ? { mes: Number(mes) } : {}),
    ...(vendedorId ? { vendedorId } : {}),
  });

  const { remove } = useResourceMutations("objetivos");
  const [copiarAberto, setCopiarAberto] = useState(false);

  const openEdit = (o: ObjetivoVendedorMes) => router.push(`/gerencial/objetivos/${o.id}`);

  const onDelete = async (o: ObjetivoVendedorMes) => {
    if (!confirm(`Excluir o objetivo de "${o.vendedor.nomeReduzido || o.vendedor.nome}" (${MES_ABREV[o.mes - 1]}/${o.ano})?`)) return;
    try {
      await remove.mutateAsync(o.id);
      toast.success("Objetivo excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir objetivo");
    }
  };

  const filtrosAtivos = !!ano || !!mes || !!vendedorId;
  const limparFiltros = () => {
    setAno("");
    setMes(undefined);
    setVendedorId(undefined);
    setPage(1);
  };

  const columns: ColumnDef<ObjetivoVendedorMes>[] = [
    {
      header: "Vendedor",
      cell: (o) => <span className="font-medium">{o.vendedor.nomeReduzido || o.vendedor.nome}</span>,
    },
    {
      header: "Mês/Ano",
      sortKey: "mes",
      cell: (o) => `${MES_ABREV[o.mes - 1]}/${o.ano}`,
    },
    {
      header: "Valor da meta",
      sortKey: "valor",
      className: "text-right",
      cell: (o) => moeda(o.valor),
    },
    {
      header: "Nº clientes (meta)",
      className: "text-right",
      cell: (o) => o.numeroCliente ?? "—",
    },
    { header: "Status", sortKey: "ativo", cell: (o) => <StatusDot active={o.ativo} /> },
    {
      header: "",
      className: "w-10",
      cell: (o) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(o)}>
              <Pencil className="size-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(o)}>
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
        onCreate={() => router.push("/gerencial/objetivos/novo")}
        createLabel="Novo objetivo"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCopiarAberto(true)}>
            <Copy className="size-4" />
            Copiar período
          </Button>
        </div>
        <StatusQuickFilter
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <FiltersPopover active={filtrosAtivos} onClear={limparFiltros}>
          <div className="space-y-2">
            <FieldLabel htmlFor="filtro-ano">Ano</FieldLabel>
            <Input
              id="filtro-ano"
              placeholder="Ex.: 2026"
              inputMode="numeric"
              maxLength={4}
              value={ano}
              onChange={(e) => {
                setAno(e.target.value.replace(/\D/g, ""));
                setPage(1);
              }}
            />
          </div>

          <div className="space-y-2">
            <FieldLabel>Mês</FieldLabel>
            <Select
              value={mes ?? "none"}
              onValueChange={(v) => {
                setMes(v === "none" ? undefined : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Todos</SelectItem>
                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                  <SelectItem key={m} value={m}>
                    {m.padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
                    {vendedorFiltroLabel(v)}
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
        rowKey={(o) => o.id}
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
        emptyMessage="Nenhum objetivo cadastrado."
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(key, order) => {
          setSortBy(key);
          setSortOrder(order);
        }}
        storageKey="objetivos"
      />

      <ObjetivoCopiarDialog
        open={copiarAberto}
        onOpenChange={setCopiarAberto}
        onCopiado={() => refetch()}
      />
    </div>
  );
}
