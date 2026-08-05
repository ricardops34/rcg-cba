"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { EstagioOportunidade, Oportunidade } from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError } from "@/lib/api-client";
import { useVendedoresEscopo } from "@/hooks/use-vendedores-escopo";
import { useVendedorPadrao } from "@/hooks/use-vendedor-padrao";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { QuickFilterButton, QuickFilterGroup } from "@/components/crud/quick-filter-group";
import { OportunidadesKanban } from "@/components/crud/oportunidades-kanban";
import { ESTAGIOS, ESTAGIO_LABEL, ESTAGIO_VARIANT } from "@/components/crud/oportunidade-estagio";
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
import { LayoutGrid, List, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

type EstagioFiltro = "todos" | EstagioOportunidade;
type Visao = "kanban" | "lista";

const moeda = (v: number | null) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const dataBr = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

export default function OportunidadesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [status, setStatus] = useState<StatusFilterValue>("ativos");
  const [estagio, setEstagio] = useState<EstagioFiltro>("todos");
  const [vendedorId, setVendedorId] = useState<string | undefined>(undefined);
  const [visao, setVisao] = useState<Visao>("kanban");

  const vendedoresEscopoQuery = useVendedoresEscopo();
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];
  const mostrarFiltroVendedor = !(vendedoresEscopoQuery.data?.ehVendedorPuro ?? false);
  useVendedorPadrao(vendedoresEscopoQuery.data?.meuVendedorId, setVendedorId);

  const { data, isLoading, isFetching, refetch } = useResourceList<Oportunidade>("oportunidades", {
    search,
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
    ...(estagio !== "todos" ? { estagio } : {}),
    ...(vendedorId ? { vendedorId } : {}),
  });

  const { remove } = useResourceMutations("oportunidades");

  const abrirEdicao = (o: Oportunidade) => router.push(`/crm/oportunidades/${o.id}`);

  const onDelete = async (o: Oportunidade) => {
    if (!confirm(`Excluir a oportunidade "${o.titulo}"?`)) return;
    try {
      await remove.mutateAsync(o.id);
      toast.success("Oportunidade excluída");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao excluir oportunidade");
    }
  };

  const filtrosAtivos = estagio !== "todos" || !!vendedorId;
  const limparFiltros = () => {
    setEstagio("todos");
    setVendedorId(undefined);
    setPage(1);
  };

  const columns: ColumnDef<Oportunidade>[] = [
    { header: "Título", sortKey: "titulo", cell: (o) => <p className="font-medium">{o.titulo}</p> },
    {
      header: "Cliente",
      cell: (o) => (
        <span className="text-xs">{o.cliente.nomeFantasia || o.cliente.razaoSocial}</span>
      ),
    },
    {
      header: "Vendedor",
      cell: (o) => <span className="text-xs">{o.vendedor.nomeReduzido || o.vendedor.nome}</span>,
    },
    {
      header: "Estágio",
      sortKey: "estagio",
      cell: (o) => <Badge variant={ESTAGIO_VARIANT[o.estagio]}>{ESTAGIO_LABEL[o.estagio]}</Badge>,
    },
    {
      header: "Valor previsto",
      sortKey: "valorPrevisto",
      className: "text-right",
      cell: (o) => moeda(o.valorPrevisto),
    },
    { header: "Previsão", sortKey: "dataPrevisao", cell: (o) => dataBr(o.dataPrevisao) },
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
        onCreate={() => router.push("/crm/oportunidades/novo")}
        createLabel="Nova oportunidade"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusQuickFilter
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <QuickFilterGroup>
            <QuickFilterButton active={visao === "kanban"} onClick={() => setVisao("kanban")}>
              <LayoutGrid className="size-3.5" />
              Kanban
            </QuickFilterButton>
            <QuickFilterButton active={visao === "lista"} onClick={() => setVisao("lista")}>
              <List className="size-3.5" />
              Lista
            </QuickFilterButton>
          </QuickFilterGroup>

          <FiltersPopover active={filtrosAtivos} onClear={limparFiltros}>
          {visao === "lista" && (
            <div className="space-y-2">
              <FieldLabel>Estágio</FieldLabel>
              <Select
                value={estagio}
                onValueChange={(v) => {
                  setEstagio(v as EstagioFiltro);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {ESTAGIOS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
      </div>

      {visao === "kanban" ? (
        <OportunidadesKanban
          search={search}
          vendedorId={vendedorId}
          ativo={status !== "todos" ? status === "ativos" : undefined}
          onEdit={abrirEdicao}
        />
      ) : (
        <EntityTable
          columns={columns}
          rows={data?.data ?? []}
          rowKey={(o) => o.id}
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
          emptyMessage="Nenhuma oportunidade cadastrada."
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortChange={(key, order) => {
            setSortBy(key);
            setSortOrder(order);
          }}
          storageKey="oportunidades"
        />
      )}
    </div>
  );
}
