"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { PosicaoClienteListRow } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { apiFetch } from "@/lib/api-client";
import { useVendedoresEscopo, vendedorFiltroLabel } from "@/hooks/use-vendedores-escopo";
import { useVendedorPadrao } from "@/hooks/use-vendedor-padrao";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import { StatusQuickFilter, type StatusFilterValue } from "@/components/crud/status-quick-filter";
import { QuickFilterButton, QuickFilterGroup } from "@/components/crud/quick-filter-group";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { ClienteSheet } from "@/components/crud/cliente-form";
import { OrcamentoSheet } from "@/components/crud/orcamento-form";
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
import {
  ClipboardList,
  Eye,
  FilePlus2,
  Lock,
  MoreHorizontal,
  Pencil,
} from "lucide-react";

const DIAS_OPCOES = [120, 90, 60, 30, 15] as const;

type SimNaoTodos = "todos" | "sim" | "nao";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

// Prioridade vencido > vencendo (≤7 dias) > não vencido — o $ mostra só a
// pior situação entre os títulos em aberto do cliente; sem título em
// aberto, não mostra nada.
function tituloIndicador(c: PosicaoClienteListRow): { cor: string; legenda: string } | null {
  if (c.temTituloVencido) return { cor: "text-destructive", legenda: "Tem título vencido" };
  if (c.temTituloVencendo) return { cor: "text-blue-600 dark:text-blue-400", legenda: "Tem título vencendo nos próximos 7 dias" };
  if (c.temTituloNaoVencido) return { cor: "text-success", legenda: "Tem título em aberto, não vencido" };
  return null;
}

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
  const [status, setStatus] = useState<StatusFilterValue>("ativos");
  const [uf, setUf] = useState<string | undefined>(undefined);
  const [municipio, setMunicipio] = useState<string | undefined>(undefined);
  const [vendedorId, setVendedorId] = useState<string | undefined>(undefined);
  const [carteira, setCarteira] = useState<SimNaoTodos>("todos");
  const [diasSemComprar, setDiasSemComprar] = useState<number | undefined>(undefined);

  // Visualizar/Alterar Cliente e Incluir Orçamento abrem em cortina lateral
  // (não navegam pra fora desta listagem) — só nesta tela; o cadastro de
  // Clientes continua abrindo em página cheia normalmente.
  const [clienteSheet, setClienteSheet] = useState<{ id: string; modo: "visualizar" | "alterar" } | null>(
    null,
  );
  const [orcamentoClienteId, setOrcamentoClienteId] = useState<string | null>(null);

  // Opções de vendedor já restritas ao escopo do usuário logado — não usa
  // /vendedores direto (aquele endpoint não tem restrição de carteira).
  // ehVendedorPuro (vendedor "de carteira", nem supervisor nem gerente):
  // filtrar a própria carteira pelo próprio vendedor não faz sentido, então
  // o filtro Vendedor some por completo pra esse perfil; supervisor/gerente
  // continuam vendo, já restrito ao próprio time. apenasComCliente: só
  // vendedores com pelo menos um cliente (inclui bloqueados) — filtrar por
  // um vendedor sem nenhum cliente na Posição de Cliente não serviria pra
  // nada, e um vendedor bloqueado ainda pode ter carteira pra revisar.
  const vendedoresEscopoQuery = useVendedoresEscopo({ apenasComCliente: true, uf, municipio });
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];
  const ehVendedorPuro = vendedoresEscopoQuery.data?.ehVendedorPuro ?? false;
  const mostrarFiltroVendedor = !ehVendedorPuro;
  // Supervisor/gerente: tela inicia com o filtro em "Qualquer" (não faz
  // sentido pré-filtrar pela própria carteira de quem enxerga a de vários
  // vendedores) — só vendedor puro (que nem vê este filtro) recebe o próprio
  // id como padrão.
  useVendedorPadrao(ehVendedorPuro ? vendedoresEscopoQuery.data?.meuVendedorId : null, setVendedorId);

  // UFs e municípios distintos presentes na carteira visível ao usuário —
  // só lista o que realmente existe no cadastro (mesmo racional de escopo
  // do filtro Vendedor). Cada um usa os demais filtros já selecionados
  // (facetas irmãs) pra se restringir — selecionar uma UF só mostra
  // municípios daquela UF, selecionar um vendedor só mostra UF/município da
  // carteira dele, e vice-versa.
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

  const { data, isLoading, isFetching, refetch, error } = useResourceList<PosicaoClienteListRow>(
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
    },
  );

  // "Ativos" é o status inicial da tela — não conta como filtro "aplicado"
  // pro indicador do botão Filtros; só sai desse estado padrão se o usuário
  // trocar pra Todos/Inativos.
  const filtrosAtivos =
    status !== "ativos" ||
    !!uf ||
    !!municipio ||
    !!vendedorId ||
    carteira !== "todos" ||
    diasSemComprar !== undefined;

  const limparFiltros = () => {
    setStatus("ativos");
    setUf(undefined);
    setMunicipio(undefined);
    setVendedorId(undefined);
    setCarteira("todos");
    setDiasSemComprar(undefined);
    setPage(1);
  };

  const aplicarFiltroRapidoDias = (dias: number) => {
    setDiasSemComprar((atual) => (atual === dias ? undefined : dias));
    setPage(1);
  };

  const columns: ColumnDef<PosicaoClienteListRow>[] = [
    {
      header: "Títulos",
      cell: (c) => {
        const indicador = tituloIndicador(c);
        if (!indicador) return null;
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`text-base font-bold ${indicador.cor}`}>$</span>
            </TooltipTrigger>
            <TooltipContent>{indicador.legenda}</TooltipContent>
          </Tooltip>
        );
      },
    },
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
            <DropdownMenuItem onClick={() => setClienteSheet({ id: c.id, modo: "visualizar" })}>
              <Eye className="size-4" /> Visualizar Cliente
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setClienteSheet({ id: c.id, modo: "alterar" })}>
              <Pencil className="size-4" /> Alterar Cliente
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(`/comercial/posicao-cliente/${c.id}`)}>
              <ClipboardList className="size-4" /> Posição do Cliente
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOrcamentoClienteId(c.id)}>
              <FilePlus2 className="size-4" /> Incluir Orçamento
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
            {DIAS_OPCOES.map((dias) => (
              <QuickFilterButton
                key={dias}
                active={diasSemComprar === dias}
                onClick={() => aplicarFiltroRapidoDias(dias)}
              >
                +{dias} dias
              </QuickFilterButton>
            ))}
          </QuickFilterGroup>
        </div>
        <FiltersPopover active={filtrosAtivos} onClear={limparFiltros}>
          <div className="space-y-2">
            <FieldLabel>UF</FieldLabel>
            <Select
              value={uf ?? "todas"}
              onValueChange={(v) => {
                setUf(v === "todas" ? undefined : v);
                // Um município de outra UF deixaria de existir na lista —
                // evita ficar com um filtro de município inválido/invisível.
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
                      <span className="flex items-center gap-1.5">
                        {vendedorFiltroLabel(v)}
                        {!v.ativo && (
                          <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Lock className="size-3" />
                            bloqueado
                          </span>
                        )}
                      </span>
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

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="font-medium">Títulos em aberto:</span>
        <span className="flex items-center gap-1">
          <span className="text-sm font-bold text-destructive">$</span> vencido
        </span>
        <span className="flex items-center gap-1">
          <span className="text-sm font-bold text-blue-600 dark:text-blue-400">$</span> vencendo em até 7 dias
        </span>
        <span className="flex items-center gap-1">
          <span className="text-sm font-bold text-success">$</span> não vencido
        </span>
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

      <ClienteSheet
        id={clienteSheet?.id ?? null}
        modo={clienteSheet?.modo ?? "visualizar"}
        onOpenChange={(open) => !open && setClienteSheet(null)}
      />
      <OrcamentoSheet
        clienteId={orcamentoClienteId}
        onOpenChange={(open) => !open && setOrcamentoClienteId(null)}
      />
    </div>
  );
}
