"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { PosicaoClienteListRow, TipoPessoa, Vendedor } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { apiFetch } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CircleCheck, Lock } from "lucide-react";

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

const DIAS_OPCOES = [120, 90, 60, 30, 15] as const;

type SimNaoTodos = "todos" | "sim" | "nao";
type TipoPessoaFiltro = "todos" | TipoPessoa;

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

// Listagem base de Posição de Cliente: colunas de venda calculadas ao vivo
// (GET /clientes/posicao). O clique na linha abre a Posição de Cliente
// detalhada — agrupado de notas, títulos e mix.
export default function PosicaoClientePage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("ultimaCompra");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [status, setStatus] = useState<StatusFilterValue>("todos");
  const [tipoPessoa, setTipoPessoa] = useState<TipoPessoaFiltro>("todos");
  const [uf, setUf] = useState<string | undefined>(undefined);
  const [vendedorId, setVendedorId] = useState<string | undefined>(undefined);
  const [carteira, setCarteira] = useState<SimNaoTodos>("todos");
  const [diasSemComprar, setDiasSemComprar] = useState<number | undefined>(undefined);
  const [bloqueado, setBloqueado] = useState(false);

  // Opções de vendedor já restritas ao escopo do usuário logado — não usa
  // /vendedores direto (aquele endpoint não tem restrição de carteira).
  const vendedoresEscopoQuery = useQuery({
    queryKey: ["clientes", "vendedores-escopo"],
    queryFn: () => apiFetch<{ data: Vendedor[]; restrito: boolean }>("/clientes/vendedores-escopo"),
  });
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];
  const restrito = vendedoresEscopoQuery.data?.restrito ?? false;
  const mostrarFiltroVendedor = !restrito || opcoesVendedor.length > 1;

  const { data, isLoading, isFetching, refetch } = useResourceList<PosicaoClienteListRow>(
    "clientes/posicao",
    {
      search,
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(status !== "todos" ? { ativo: status === "ativos" } : {}),
      ...(tipoPessoa !== "todos" ? { tipoPessoa } : {}),
      ...(uf ? { uf } : {}),
      ...(vendedorId ? { vendedorId } : {}),
      ...(carteira !== "todos" ? { carteira: carteira === "sim" } : {}),
      ...(diasSemComprar !== undefined ? { diasSemComprar } : {}),
      ...(bloqueado ? { bloqueado: true } : {}),
    },
  );

  const filtrosAtivos =
    tipoPessoa !== "todos" ||
    !!uf ||
    !!vendedorId ||
    carteira !== "todos" ||
    diasSemComprar !== undefined ||
    bloqueado;

  const limparFiltros = () => {
    setTipoPessoa("todos");
    setUf(undefined);
    setVendedorId(undefined);
    setCarteira("todos");
    setDiasSemComprar(undefined);
    setBloqueado(false);
    setPage(1);
  };

  const aplicarFiltroRapidoDias = (dias: number) => {
    setBloqueado(false);
    setDiasSemComprar((atual) => (atual === dias ? undefined : dias));
    setPage(1);
  };
  const aplicarFiltroRapidoBloqueados = () => {
    setDiasSemComprar(undefined);
    setBloqueado((atual) => !atual);
    setPage(1);
  };
  const aplicarFiltroRapidoAtivo = () => {
    setDiasSemComprar(undefined);
    setBloqueado(false);
    setStatus("ativos");
    setPage(1);
  };

  const columns: ColumnDef<PosicaoClienteListRow>[] = [
    { header: "Situação", sortKey: "ativo", cell: (c) => <StatusDot active={c.ativo} /> },
    {
      header: "Código",
      sortKey: "codigoErp",
      cell: (c) => <span className="font-mono text-xs">{c.codigoErp || "—"}</span>,
    },
    { header: "Últ. Compra", sortKey: "ultimaCompra", cell: (c) => dataBr(c.ultimaCompra) },
    {
      header: "Razão Social",
      sortKey: "razaoSocial",
      className: "whitespace-normal",
      cell: (c) => <span className="block max-w-56 font-medium">{c.razaoSocial}</span>,
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
      header: "Dif. Mês/Média",
      sortKey: "difMesEMedia",
      className: "text-right",
      cell: (c) => (
        <span className={c.difMesEMedia >= 0 ? "text-emerald-600" : "text-destructive"}>
          {moeda(c.difMesEMedia)}
        </span>
      ),
    },
    {
      header: "Venda 30 dias",
      sortKey: "vendaUltimos30Dias",
      className: "text-right",
      cell: (c) => moeda(c.vendaUltimos30Dias),
    },
    {
      header: "Venda Média 90d",
      sortKey: "vendaMedia90Dias",
      className: "text-right",
      cell: (c) => moeda(c.vendaMedia90Dias),
    },
    {
      header: "Dias",
      sortKey: "dias",
      className: "text-right",
      cell: (c) => c.dias ?? "—",
    },
    { header: "Comodato", sortKey: "comodato", cell: (c) => (c.comodato ? "Sim" : "Não") },
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
            <FieldLabel>Filtros rápidos</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {DIAS_OPCOES.map((dias) => (
                <Button
                  key={dias}
                  type="button"
                  size="sm"
                  variant={diasSemComprar === dias ? "default" : "outline"}
                  onClick={() => aplicarFiltroRapidoDias(dias)}
                >
                  +{dias} dias
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={bloqueado ? "default" : "outline"}
                onClick={aplicarFiltroRapidoBloqueados}
              >
                <Lock className="size-3.5" />
                Bloqueados
              </Button>
              <Button
                type="button"
                size="sm"
                variant={status === "ativos" ? "default" : "outline"}
                onClick={aplicarFiltroRapidoAtivo}
              >
                <CircleCheck className="size-3.5" />
                Ativo
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <FieldLabel>Tipo de pessoa</FieldLabel>
            <Select
              value={tipoPessoa}
              onValueChange={(v) => {
                setTipoPessoa(v as TipoPessoaFiltro);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="juridica">Jurídica</SelectItem>
                <SelectItem value="fisica">Física</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <FieldLabel>UF</FieldLabel>
            <Select
              value={uf ?? "todas"}
              onValueChange={(v) => {
                setUf(v === "todas" ? undefined : v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {UFS.map((sigla) => (
                  <SelectItem key={sigla} value={sigla}>
                    {sigla}
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

          <div className="space-y-2">
            <FieldLabel>Cliente de carteira</FieldLabel>
            <Select
              value={carteira}
              onValueChange={(v) => {
                setCarteira(v as SimNaoTodos);
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
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? pageSize}
        total={data?.total ?? 0}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        onRowClick={(c) => router.push(`/comercial/posicao-cliente/${c.id}`)}
        emptyMessage="Nenhum cliente encontrado."
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={(key, order) => {
          setSortBy(key);
          setSortOrder(order);
        }}
        storageKey="posicao-cliente"
      />
    </div>
  );
}
