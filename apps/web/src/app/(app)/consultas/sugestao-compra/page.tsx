"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SugestaoCompraListRow } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useVendedoresEscopo, vendedorFiltroLabel } from "@/hooks/use-vendedores-escopo";
import { useVendedorPadrao } from "@/hooks/use-vendedor-padrao";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { SugestaoCompraCalculadaSheet } from "@/components/crud/sugestao-compra-calculada";
import { SugestaoCompraGerarDialog } from "@/components/crud/sugestao-compra-gerar-dialog";
import { FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calculator, Eye, Lightbulb, Lock, MoreHorizontal, RefreshCw } from "lucide-react";

type SimNaoTodos = "todos" | "sim" | "nao";

const dataHoraBr = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
};

/**
 * Sugestão de compra: um cliente por linha, com quando a sugestão dele foi
 * calculada pela última vez. Não calcula nada ao abrir — só lê o que já foi
 * gravado (GET /sugestao-compra). Calcular é ação explícita, linha a linha
 * ou em lote pela barra, porque a varredura é cara.
 */
export default function SugestaoCompraPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("razaoSocial");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("ativos");
  const [uf, setUf] = useState<string | undefined>(undefined);
  const [municipio, setMunicipio] = useState<string | undefined>(undefined);
  const [vendedorId, setVendedorId] = useState<string | undefined>(undefined);
  const [bloqueado, setBloqueado] = useState<SimNaoTodos>("todos");

  const [visualizarCliente, setVisualizarCliente] = useState<{ id: string; razaoSocial: string } | null>(
    null,
  );
  const [calcularCliente, setCalcularCliente] = useState<{ id: string; razaoSocial: string } | null>(
    null,
  );
  const [calcularLote, setCalcularLote] = useState(false);

  const permissoes = useAuthStore((s) => s.user?.permissoes);
  const podeCalcular = Boolean(permissoes?.includes("sugestao-compra.cadastrar"));

  const vendedoresEscopoQuery = useVendedoresEscopo({ apenasComCliente: true, uf, municipio });
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];
  const ehVendedorPuro = vendedoresEscopoQuery.data?.ehVendedorPuro ?? false;
  const mostrarFiltroVendedor = !ehVendedorPuro;
  useVendedorPadrao(ehVendedorPuro ? vendedoresEscopoQuery.data?.meuVendedorId : null, setVendedorId);

  // O cálculo em lote é gerencial: vendedor "de carteira" continua com o
  // Calcular por linha (o cliente é dele), mas o botão da barra — que corre
  // sobre uma faixa que pode ir além do que ele atende — some para ele. A
  // mesma flag que já esconde o filtro Vendedor (supervisor/gerente,
  // administrativo, diretor e admin têm `ehVendedorPuro: false`) resolve isso
  // sem precisar de uma permissão nova.
  const podeCalcularLote = podeCalcular && !ehVendedorPuro;

  // Facetas irmãs: cada uma se restringe pelos demais filtros já
  // selecionados — mesmo racional de Posição de Cliente.
  const ufsEscopoQuery = useQuery({
    queryKey: ["clientes", "ufs-escopo", municipio, vendedorId],
    queryFn: () =>
      apiFetch<{ data: { uf: string; total: number }[] }>("/clientes/ufs-escopo", {
        query: { municipio, vendedorId },
      }),
  });
  const opcoesUf = ufsEscopoQuery.data?.data ?? [];

  const municipiosEscopoQuery = useQuery({
    queryKey: ["clientes", "municipios-escopo", uf, vendedorId],
    queryFn: () =>
      apiFetch<{ data: { municipio: string; total: number }[] }>("/clientes/municipios-escopo", {
        query: { uf, vendedorId },
      }),
  });
  const opcoesMunicipio = municipiosEscopoQuery.data?.data ?? [];

  const { data, isLoading, isFetching, refetch, error } = useResourceList<SugestaoCompraListRow>(
    "sugestao-compra",
    {
      search,
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
      ...(uf ? { uf } : {}),
      ...(municipio ? { municipio } : {}),
      ...(vendedorId ? { vendedorId } : {}),
      ...(bloqueado !== "todos" ? { bloqueado: bloqueado === "sim" } : {}),
    },
  );

  const filtrosAtivos =
    status !== "ativos" || !!uf || !!municipio || !!vendedorId || bloqueado !== "todos";

  const limparFiltros = () => {
    setStatus("ativos");
    setUf(undefined);
    setMunicipio(undefined);
    setVendedorId(undefined);
    setBloqueado("todos");
    setPage(1);
  };

  const columns: ColumnDef<SugestaoCompraListRow>[] = [
    { header: "Situação", sortKey: "ativo", cell: (c) => <StatusDot active={c.ativo} /> },
    {
      header: "Código",
      sortKey: "codigoErp",
      cell: (c) => <span className="font-mono text-xs">{c.codigoErp || "—"}</span>,
    },
    {
      header: "Razão Social",
      sortKey: "razaoSocial",
      className: "whitespace-normal",
      cell: (c) => (
        <span className="flex items-center gap-1.5">
          <span className="block max-w-56 font-medium">{c.razaoSocial}</span>
          {c.bloqueado && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Lock className="size-3.5 shrink-0 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>Cliente bloqueado — não entra no cálculo</TooltipContent>
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      header: "Cidade",
      sortKey: "municipio",
      cell: (c) => (
        <span className="block max-w-28 truncate" title={c.municipio ?? undefined}>
          {c.municipio || "—"}
        </span>
      ),
    },
    {
      header: "Sugestões",
      className: "text-right",
      cell: (c) =>
        c.qtdSugestoes > 0 ? (
          <span className="inline-flex items-center gap-1">
            <Lightbulb className="size-3.5 text-amber-500" />
            {c.qtdSugestoes}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: "Último cálculo",
      sortKey: "ultimoCalculo",
      cell: (c) => dataHoraBr(c.ultimoCalculo),
    },
    {
      header: "",
      className: "w-10",
      cell: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={(ev) => ev.stopPropagation()}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(ev) => ev.stopPropagation()}>
            <DropdownMenuItem
              onClick={() => setVisualizarCliente({ id: c.id, razaoSocial: c.razaoSocial })}
            >
              <Eye className="size-4" /> Visualizar
            </DropdownMenuItem>
            {podeCalcular && (
              <DropdownMenuItem
                disabled={c.bloqueado || !c.ativo}
                onClick={() => setCalcularCliente({ id: c.id, razaoSocial: c.razaoSocial })}
              >
                <Calculator className="size-4" /> Calcular
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-4" data-tour="rotina">
      <CrudHeader
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {podeCalcularLote && (
            <Button variant="outline" size="sm" onClick={() => setCalcularLote(true)}>
              <RefreshCw className="size-4" /> Calcular
            </Button>
          )}
          <StatusQuickFilter
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          />
        </div>
        <FiltersPopover active={filtrosAtivos} onClear={limparFiltros}>
          <div className="space-y-2">
            <FieldLabel>UF</FieldLabel>
            <Select
              value={uf ?? "todas"}
              onValueChange={(v) => {
                setUf(v === "todas" ? undefined : v);
                setMunicipio(undefined);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {opcoesUf.map((o) => (
                  <SelectItem key={o.uf} value={o.uf}>
                    {o.uf} ({o.total})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <FieldLabel>Município</FieldLabel>
            <Select
              value={municipio ?? "todos"}
              onValueChange={(v) => {
                setMunicipio(v === "todos" ? undefined : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {opcoesMunicipio.map((o) => (
                  <SelectItem key={o.municipio} value={o.municipio}>
                    {o.municipio} ({o.total})
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

          <div className="space-y-2">
            <FieldLabel>Bloqueado</FieldLabel>
            <Select
              value={bloqueado}
              onValueChange={(v) => {
                setBloqueado(v as SimNaoTodos);
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
        rowKey={(c) => c.id}
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
        onRowClick={(c) => setVisualizarCliente({ id: c.id, razaoSocial: c.razaoSocial })}
        emptyMessage="Nenhum cliente encontrado."
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(key, order) => {
          setSortBy(key);
          setSortOrder(order);
        }}
        storageKey="sugestao-compra"
      />

      <SugestaoCompraCalculadaSheet
        clienteId={visualizarCliente?.id ?? null}
        razaoSocial={visualizarCliente?.razaoSocial}
        onOpenChange={(open) => !open && setVisualizarCliente(null)}
      />
      <SugestaoCompraGerarDialog
        open={!!calcularCliente}
        onOpenChange={(open) => !open && setCalcularCliente(null)}
        clienteId={calcularCliente?.id}
        razaoSocial={calcularCliente?.razaoSocial}
        onGerado={() => void refetch()}
      />
      <SugestaoCompraGerarDialog
        open={calcularLote}
        onOpenChange={setCalcularLote}
        onGerado={() => void refetch()}
      />
    </div>
  );
}
