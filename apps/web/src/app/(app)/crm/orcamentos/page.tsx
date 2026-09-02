"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Orcamento, StatusOrcamento } from "@plataforma/contracts";
import { ORIGEM_VENDA_ROTULO } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { useVendedoresEscopo, vendedorFiltroLabel } from "@/hooks/use-vendedores-escopo";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { useFiltrosUrl } from "@/hooks/use-filtros-url";
import {
  STATUS_ORCAMENTO,
  STATUS_ORCAMENTO_LABEL,
  STATUS_ORCAMENTO_VARIANT,
} from "@/components/crud/orcamento-status";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Clock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

type StatusFiltro = "todos" | StatusOrcamento;

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

// Acompanhamento da integração com o ERP: só faz sentido depois de aprovado
// (é quando o orçamento fica disponível pro ERP puxar via API). codigoErp
// preenchido = o ERP já vinculou o registro; null = ainda aguardando.
function integracaoIndicador(o: Orcamento) {
  if (o.status !== "aprovado") return null;
  if (o.codigoErp != null) {
    return {
      icone: CheckCircle2,
      cor: "text-emerald-600",
      legenda: `Integrado ao ERP (código ${o.codigoErp})`,
    };
  }
  return {
    icone: Clock,
    cor: "text-amber-500",
    legenda: "Aprovado — aguardando integração com o ERP",
  };
}

export default function OrcamentosPage() {
  const router = useRouter();
  // Filtros que podem vir do link do assistente — ver `useFiltrosUrl`.
  const urlFiltros = useFiltrosUrl();
  const [search, setSearch] = useState(() => urlFiltros.texto("search") ?? "");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [status_, setStatus] = useState<StatusFilterValue>("ativos");
  const [statusOrcamento, setStatusOrcamento] = useState<StatusFiltro>("todos");
  const [clienteId] = useState(() => urlFiltros.texto("clienteId"));
  const [vendedorId, setVendedorId] = useState<string | undefined>(() =>
    urlFiltros.texto("vendedorId"),
  );

  const vendedoresEscopoQuery = useVendedoresEscopo();
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];
  const mostrarFiltroVendedor = !(vendedoresEscopoQuery.data?.ehVendedorPuro ?? false);

  const { data, isLoading, isFetching, refetch, error } = useResourceList<Orcamento>("orcamentos", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status_ !== "todos" ? { ativo: status_ === "ativos" } : {}),
    ...(statusOrcamento !== "todos" ? { status: statusOrcamento } : {}),
    ...(clienteId ? { clienteId } : {}),
    ...(vendedorId ? { vendedorId } : {}),
  });

  const { remove } = useResourceMutations("orcamentos");

  const abrirEdicao = (o: Orcamento) => router.push(`/crm/orcamentos/${o.id}`);

  const onDelete = async (o: Orcamento) => {
    if (!confirm(`Excluir o orçamento "${o.titulo}"?`)) return;
    try {
      await remove.mutateAsync(o.id);
      toast.success("Orçamento excluído");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir orçamento");
    }
  };

  const filtrosAtivos = statusOrcamento !== "todos" || !!vendedorId;
  const limparFiltros = () => {
    setStatusOrcamento("todos");
    setVendedorId(undefined);
    setPage(1);
  };

  const columns: ColumnDef<Orcamento>[] = [
    {
      header: "Nº",
      sortKey: "numero",
      className: "w-16",
      cell: (o) => <span className="font-mono text-xs">{o.numero}</span>,
    },
    { header: "Título", sortKey: "titulo", cell: (o) => <p className="font-medium">{o.titulo}</p> },
    {
      header: "Cliente",
      cell: (o) => <span className="text-xs">{o.cliente.nomeFantasia || o.cliente.razaoSocial}</span>,
    },
    {
      header: "Vendedor",
      cell: (o) => (
        <span className="text-xs">
          {o.vendedor.nomeReduzido || o.vendedor.nome}
          {/* A venda é sempre do vendedor do cliente; quando quem a montou foi
              outra pessoa (supervisor, gerente, administração ou o próprio
              cliente), a origem aparece ao lado do nome — senão a leitura de
              desempenho confunde "o vendedor fez" com "fizeram por ele". */}
          {o.origem !== "vendedor" && (
            <span className="ml-1 text-muted-foreground">
              · via {ORIGEM_VENDA_ROTULO[o.origem]}
            </span>
          )}
        </span>
      ),
    },
    {
      header: "Status",
      sortKey: "status",
      cell: (o) => (
        <Badge variant={STATUS_ORCAMENTO_VARIANT[o.status]}>{STATUS_ORCAMENTO_LABEL[o.status]}</Badge>
      ),
    },
    {
      header: "Integração",
      cell: (o) => {
        const indicador = integracaoIndicador(o);
        if (!indicador) return <span className="text-muted-foreground">—</span>;
        const Icone = indicador.icone;
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Icone className={`size-4 ${indicador.cor}`} />
            </TooltipTrigger>
            <TooltipContent>{indicador.legenda}</TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      header: "Total",
      sortKey: "vlrTotal",
      className: "text-right",
      cell: (o) => moeda(o.vlrTotal),
    },
    { header: "Válido até", sortKey: "dataValidade", cell: (o) => dataBr(o.dataValidade) },
    { header: "Ativo", sortKey: "ativo", cell: (o) => <StatusDot active={o.ativo} /> },
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
            <DropdownMenuItem onClick={() => abrirEdicao(o)}>
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
        onCreate={() => router.push("/crm/orcamentos/novo")}
        createLabel="Novo orçamento"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusQuickFilter
          value={status_}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />

        <FiltersPopover active={filtrosAtivos} onClear={limparFiltros}>
          <div className="space-y-2">
            <FieldLabel>Status</FieldLabel>
            <Select
              value={statusOrcamento}
              onValueChange={(v) => {
                setStatusOrcamento(v as StatusFiltro);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {STATUS_ORCAMENTO.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
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
                      {vendedorFiltroLabel(v)}
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
        onRowClick={abrirEdicao}
        emptyMessage="Nenhum orçamento cadastrado."
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(key, order) => {
          setSortBy(key);
          setSortOrder(order);
        }}
        storageKey="orcamentos"
      />
    </div>
  );
}
