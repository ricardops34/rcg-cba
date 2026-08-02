"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { PosicaoClienteListRow, Vendedor } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { apiFetch } from "@/lib/api-client";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { QuickFilterButton, QuickFilterGroup } from "@/components/crud/quick-filter-group";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CircleCheck, Lock } from "lucide-react";

const DIAS_OPCOES = [120, 90, 60, 30, 15] as const;

type SimNaoTodos = "todos" | "sim" | "nao";

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
  const [uf, setUf] = useState<string | undefined>(undefined);
  const [municipio, setMunicipio] = useState<string | undefined>(undefined);
  const [vendedorId, setVendedorId] = useState<string | undefined>(undefined);
  const [carteira, setCarteira] = useState<SimNaoTodos>("todos");
  const [diasSemComprar, setDiasSemComprar] = useState<number | undefined>(undefined);
  const [bloqueado, setBloqueado] = useState(false);

  // Opções de vendedor já restritas ao escopo do usuário logado — não usa
  // /vendedores direto (aquele endpoint não tem restrição de carteira).
  // ehVendedorPuro (vendedor "de carteira", nem supervisor nem gerente):
  // filtrar a própria carteira pelo próprio vendedor não faz sentido, então
  // o filtro Vendedor some por completo pra esse perfil; supervisor/gerente
  // continuam vendo, já restrito ao próprio time.
  const vendedoresEscopoQuery = useQuery({
    queryKey: ["clientes", "vendedores-escopo"],
    queryFn: () =>
      apiFetch<{ data: Vendedor[]; restrito: boolean; ehVendedorPuro: boolean }>(
        "/clientes/vendedores-escopo",
      ),
  });
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];
  const mostrarFiltroVendedor = !(vendedoresEscopoQuery.data?.ehVendedorPuro ?? false);

  // UFs e municípios distintos presentes na carteira visível ao usuário —
  // só lista o que realmente existe no cadastro (mesmo racional de escopo
  // do filtro Vendedor).
  const ufsEscopoQuery = useQuery({
    queryKey: ["clientes", "ufs-escopo"],
    queryFn: () => apiFetch<{ data: string[] }>("/clientes/ufs-escopo"),
  });
  const opcoesUf = ufsEscopoQuery.data?.data ?? [];

  const municipiosEscopoQuery = useQuery({
    queryKey: ["clientes", "municipios-escopo"],
    queryFn: () => apiFetch<{ data: string[] }>("/clientes/municipios-escopo"),
  });
  const opcoesMunicipio = municipiosEscopoQuery.data?.data ?? [];

  const { data, isLoading, isFetching, refetch } = useResourceList<PosicaoClienteListRow>(
    "clientes/posicao",
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
      ...(carteira !== "todos" ? { carteira: carteira === "sim" } : {}),
      ...(diasSemComprar !== undefined ? { diasSemComprar } : {}),
      ...(bloqueado ? { bloqueado: true } : {}),
    },
  );

  const filtrosAtivos =
    !!uf ||
    !!municipio ||
    !!vendedorId ||
    carteira !== "todos" ||
    diasSemComprar !== undefined ||
    bloqueado;

  const limparFiltros = () => {
    setUf(undefined);
    setMunicipio(undefined);
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

  // Os três atalhos (dias/bloqueados/ativo) já se excluem mutuamente nos
  // handlers acima — isso só deriva qual botão do grupo aparece marcado.
  const filtroRapidoAtivo = bloqueado
    ? "bloqueados"
    : diasSemComprar !== undefined
      ? `dias-${diasSemComprar}`
      : status === "ativos"
        ? "ativo"
        : null;

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
            <QuickFilterGroup>
              {DIAS_OPCOES.map((dias) => (
                <QuickFilterButton
                  key={dias}
                  active={filtroRapidoAtivo === `dias-${dias}`}
                  onClick={() => aplicarFiltroRapidoDias(dias)}
                >
                  +{dias} dias
                </QuickFilterButton>
              ))}
              <QuickFilterButton
                active={filtroRapidoAtivo === "bloqueados"}
                onClick={aplicarFiltroRapidoBloqueados}
              >
                <Lock className="size-3.5" />
                Bloqueados
              </QuickFilterButton>
              <QuickFilterButton
                active={filtroRapidoAtivo === "ativo"}
                onClick={aplicarFiltroRapidoAtivo}
              >
                <CircleCheck className="size-3.5" />
                Ativo
              </QuickFilterButton>
            </QuickFilterGroup>
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
                {opcoesUf.map((sigla) => (
                  <SelectItem key={sigla} value={sigla}>
                    {sigla}
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
                {opcoesMunicipio.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
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
