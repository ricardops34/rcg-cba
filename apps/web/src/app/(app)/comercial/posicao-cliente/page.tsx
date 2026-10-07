"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Wrench } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { PosicaoClienteListRow } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { apiFetch } from "@/lib/api-client";
import { dataCivilBr } from "@/lib/data";
import { useAuthStore } from "@/stores/auth-store";
import {
  useVendedoresEscopo,
  vendedorFiltroLabel,
} from "@/hooks/use-vendedores-escopo";
import { useVendedorPadrao } from "@/hooks/use-vendedor-padrao";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import {
  StatusQuickFilter,
  type StatusFilterValue,
} from "@/components/crud/status-quick-filter";
import {
  QuickFilterButton,
  QuickFilterGroup,
} from "@/components/crud/quick-filter-group";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { ClienteSheet } from "@/components/crud/cliente-form";
import { OrcamentoSheet } from "@/components/crud/orcamento-form";
import { FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  MessageCircle,
  MoreHorizontal,
  Pencil,
} from "lucide-react";

const DIAS_OPCOES = [120, 90, 60, 30, 15] as const;

type SimNaoTodos = "todos" | "sim" | "nao";

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = dataCivilBr;

// Prioridade vencido > vencendo (≤7 dias) > não vencido — o $ mostra só a
// pior situação entre os títulos em aberto do cliente; sem título em
// aberto, não mostra nada.
function tituloIndicador(
  c: PosicaoClienteListRow,
): { cor: string; legenda: string } | null {
  if (c.temTituloVencido)
    return { cor: "text-destructive", legenda: "Tem título vencido" };
  if (c.temTituloVencendo)
    return {
      cor: "text-blue-600 dark:text-blue-400",
      legenda: "Tem título vencendo nos próximos 7 dias",
    };
  if (c.temTituloNaoVencido)
    return {
      cor: "text-success",
      legenda: "Tem título em aberto, não vencido",
    };
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
  const [sortBy, setSortBy] = useState("dias");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [status, setStatus] = useState<StatusFilterValue>("ativos");
  const [uf, setUf] = useState<string | undefined>(undefined);
  const [municipio, setMunicipio] = useState<string | undefined>(undefined);
  const [vendedorId, setVendedorId] = useState<string | undefined>(undefined);
  const [carteira, setCarteira] = useState<SimNaoTodos>("todos");
  const [diasSemComprar, setDiasSemComprar] = useState<number | undefined>(
    undefined,
  );
  const [temTituloVencido, setTemTituloVencido] = useState<boolean | undefined>(
    undefined,
  );
  // Aviso de comodato sem consumo e baixas (ver comodato-sql.ts na API). O
  // link da ferramenta de IA abre a lista já filtrada: ?comodatoSemConsumo=true.
  const searchParams = useSearchParams();
  const [comodatoSemConsumo, setComodatoSemConsumo] = useState<true | undefined>(
    searchParams.get("comodatoSemConsumo") === "true" ? true : undefined,
  );
  const [comodatoBaixado, setComodatoBaixado] = useState<true | undefined>(undefined);

  // Visualizar/Alterar Cliente e Incluir Orçamento abrem em cortina lateral
  // (não navegam pra fora desta listagem) — só nesta tela; o cadastro de
  // Clientes continua abrindo em página cheia normalmente.
  const [clienteSheet, setClienteSheet] = useState<{
    id: string;
    modo: "visualizar" | "alterar";
  } | null>(null);
  const [orcamentoClienteId, setOrcamentoClienteId] = useState<string | null>(
    null,
  );

  // Esconder o que o perfil não permite. Mesma leitura do menu lateral: a
  // lista de permissões já vem resolvida pelo perfil e o administrador chega
  // com todas. Esconder não é autorizar — a rota confere de novo; isto é para
  // não oferecer uma ação que vai voltar 403.
  const permissoes = useAuthStore((s) => s.user?.permissoes);
  const podeEditarCliente = Boolean(permissoes?.includes("clientes.editar"));
  const podeVerAtendimento = Boolean(
    permissoes?.includes("whatsapp-conversas.visualizar"),
  );

  // Opções de vendedor já restritas ao escopo do usuário logado — não usa
  // /vendedores direto (aquele endpoint não tem restrição de carteira).
  // ehVendedorPuro (vendedor "de carteira", nem supervisor nem gerente):
  // filtrar a própria carteira pelo próprio vendedor não faz sentido, então
  // o filtro Vendedor some por completo pra esse perfil; supervisor/gerente
  // continuam vendo, já restrito ao próprio time. apenasComCliente: só
  // vendedores com pelo menos um cliente (inclui bloqueados) — filtrar por
  // um vendedor sem nenhum cliente na Posição de Cliente não serviria pra
  // nada, e um vendedor bloqueado ainda pode ter carteira pra revisar.
  const vendedoresEscopoQuery = useVendedoresEscopo({
    apenasComCliente: true,
    uf,
    municipio,
  });
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];
  const ehVendedorPuro = vendedoresEscopoQuery.data?.ehVendedorPuro ?? false;
  const mostrarFiltroVendedor = !ehVendedorPuro;
  // Supervisor/gerente: tela inicia com o filtro em "Qualquer" (não faz
  // sentido pré-filtrar pela própria carteira de quem enxerga a de vários
  // vendedores) — só vendedor puro (que nem vê este filtro) recebe o próprio
  // id como padrão.
  useVendedorPadrao(
    ehVendedorPuro ? vendedoresEscopoQuery.data?.meuVendedorId : null,
    setVendedorId,
  );

  // UFs e municípios distintos presentes na carteira visível ao usuário —
  // só lista o que realmente existe no cadastro (mesmo racional de escopo
  // do filtro Vendedor). Cada um usa os demais filtros já selecionados
  // (facetas irmãs) pra se restringir — selecionar uma UF só mostra
  // municípios daquela UF, selecionar um vendedor só mostra UF/município da
  // carteira dele, e vice-versa.
  const ufsEscopoQuery = useQuery({
    queryKey: ["clientes", "ufs-escopo", municipio, vendedorId],
    queryFn: () =>
      apiFetch<{ data: { uf: string; total: number }[] }>(
        "/clientes/ufs-escopo",
        {
          query: { municipio, vendedorId },
        },
      ),
  });
  const opcoesUf = ufsEscopoQuery.data?.data ?? [];

  const municipiosEscopoQuery = useQuery({
    queryKey: ["clientes", "municipios-escopo", uf, vendedorId],
    queryFn: () =>
      apiFetch<{ data: { municipio: string; total: number }[] }>(
        "/clientes/municipios-escopo",
        {
          query: { uf, vendedorId },
        },
      ),
  });
  const opcoesMunicipio = municipiosEscopoQuery.data?.data ?? [];

  const { data, isLoading, isFetching, refetch, error } =
    useResourceList<PosicaoClienteListRow>("clientes/posicao", {
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
      ...(temTituloVencido !== undefined ? { temTituloVencido } : {}),
      ...(comodatoSemConsumo ? { comodatoSemConsumo } : {}),
      ...(comodatoBaixado ? { comodatoBaixado } : {}),
    });

  // "Ativos" é o status inicial da tela — não conta como filtro "aplicado"
  // pro indicador do botão Filtros; só sai desse estado padrão se o usuário
  // trocar pra Todos/Inativos.
  const filtrosAtivos =
    status !== "ativos" ||
    !!uf ||
    !!municipio ||
    !!vendedorId ||
    carteira !== "todos" ||
    diasSemComprar !== undefined ||
    temTituloVencido !== undefined ||
    !!comodatoSemConsumo ||
    !!comodatoBaixado;

  const limparFiltros = () => {
    setComodatoSemConsumo(undefined);
    setComodatoBaixado(undefined);
    setStatus("ativos");
    setUf(undefined);
    setMunicipio(undefined);
    setVendedorId(undefined);
    setCarteira("todos");
    setDiasSemComprar(undefined);
    setTemTituloVencido(undefined);
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
    {
      header: "Aviso",
      id: "aviso-comodato",
      // Aviso: está com equipamento e não comprou nenhum aplicável em 30
      // dias. O ícone some sem aviso — mesma lógica do $ dos títulos.
      cell: (c) =>
        c.comodatoSemConsumo ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Wrench className="size-4 text-amber-600 dark:text-amber-400" />
            </TooltipTrigger>
            <TooltipContent>
              Está com equipamento em comodato e não comprou nenhum produto aplicável
              nos últimos 30 dias
            </TooltipContent>
          </Tooltip>
        ) : null,
    },
    {
      header: "Situação",
      sortKey: "ativo",
      cell: (c) => <StatusDot active={c.ativo} />,
    },
    {
      header: "Código",
      sortKey: "codigoErp",
      cell: (c) => (
        <span className="font-mono text-xs">{c.codigoErp || "—"}</span>
      ),
    },
    {
      header: "Últ. Compra",
      sortKey: "ultimaCompra",
      cell: (c) => dataBr(c.ultimaCompra),
    },
    {
      header: "Razão Social",
      sortKey: "razaoSocial",
      className: "whitespace-normal",
      cell: (c) => (
        <span className="block max-w-56 font-medium">{c.razaoSocial}</span>
      ),
    },
    {
      header: "Cidade",
      sortKey: "municipio",
      cell: (c) => (
        <span
          className="block max-w-28 truncate"
          title={c.municipio ?? undefined}
        >
          {c.municipio || "—"}
        </span>
      ),
    },
    {
      header: "Dif. Mês/Média",
      sortKey: "difMesEMedia",
      className: "text-right",
      cell: (c) => (
        <span
          className={
            c.difMesEMedia >= 0 ? "text-emerald-600" : "text-destructive"
          }
        >
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
      cell: (c) =>
        c.dias ?? (
          <span
            className="text-muted-foreground"
            title="Data da última compra indisponível nas notas de venda e no cadastro do cliente."
          >
            Sem data
          </span>
        ),
    },
    {
      header: "Comodato",
      sortKey: "comodato",
      cell: (c) => (c.comodato ? "Sim" : "Não"),
    },
    {
      header: "",
      className: "w-10",
      cell: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={(ev) => ev.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(ev) => ev.stopPropagation()}
          >
            <DropdownMenuItem
              onClick={() => setClienteSheet({ id: c.id, modo: "visualizar" })}
            >
              <Eye className="size-4" /> Visualizar Cliente
            </DropdownMenuItem>
            {podeEditarCliente && (
              <DropdownMenuItem
                onClick={() => setClienteSheet({ id: c.id, modo: "alterar" })}
              >
                <Pencil className="size-4" /> Alterar Cliente
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => router.push(`/comercial/posicao-cliente/${c.id}`)}
            >
              <ClipboardList className="size-4" /> Posição do Cliente
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOrcamentoClienteId(c.id)}>
              <FilePlus2 className="size-4" /> Incluir Orçamento
            </DropdownMenuItem>
            {/* Só para quem já tem contato de WhatsApp vinculado: sem conversa
                não há conversa para abrir, e a ação levaria a uma tela
                vazia. O backend só devolve a conversa que este usuário pode
                ler (ver whatsappConversaId). */}
            {podeVerAtendimento && c.whatsappConversaId && (
              <DropdownMenuItem
                onClick={() =>
                  router.push(
                    `/comercial/atendimento?conversa=${c.whatsappConversaId}`,
                  )
                }
              >
                <MessageCircle className="size-4" /> Conversa
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div data-tour="posicao-cliente-busca">
        <CrudHeader
          search={search}
          onSearchChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          onRefresh={() => refetch()}
          isRefreshing={isFetching}
          actions={
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

              <div className="space-y-2">
                <FieldLabel>Título vencido</FieldLabel>
                <Select
                  value={
                    temTituloVencido === true
                      ? "sim"
                      : temTituloVencido === false
                        ? "nao"
                        : "todos"
                  }
                  onValueChange={(v) => {
                    setTemTituloVencido(
                      v === "sim" ? true : v === "nao" ? false : undefined,
                    );
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="sim">Com título vencido</SelectItem>
                    <SelectItem value="nao">Sem título vencido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </FiltersPopover>
          }
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex flex-wrap items-center gap-2"
          data-tour="posicao-cliente-filtros-rapidos"
        >
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
          <QuickFilterGroup>
            <QuickFilterButton
              active={temTituloVencido === true}
              onClick={() => {
                setTemTituloVencido((atual) =>
                  atual === true ? undefined : true,
                );
                setPage(1);
              }}
              className={
                temTituloVencido === true
                  ? "text-destructive font-semibold"
                  : ""
              }
            >
              <span className="text-destructive font-bold">$</span> Títulos
              vencidos
            </QuickFilterButton>
          </QuickFilterGroup>
          <QuickFilterGroup>
            <QuickFilterButton
              active={comodatoSemConsumo === true}
              onClick={() => {
                setComodatoSemConsumo((atual) => (atual ? undefined : true));
                setPage(1);
              }}
            >
              <Wrench className="size-3.5 text-amber-600 dark:text-amber-400" /> Comodato sem
              consumo
            </QuickFilterButton>
            {/* Para achar as baixas e corrigir a que estiver errada. */}
            <QuickFilterButton
              active={comodatoBaixado === true}
              onClick={() => {
                setComodatoBaixado((atual) => (atual ? undefined : true));
                setPage(1);
              }}
            >
              Comodato baixado
            </QuickFilterButton>
          </QuickFilterGroup>
        </div>
        <div data-tour="posicao-cliente-filtros-avancados"></div>
      </div>

      <div
        className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground"
        data-tour="posicao-cliente-legenda-titulos"
      >
        <span className="font-medium">Títulos em aberto:</span>
        <span className="flex items-center gap-1">
          <span className="text-sm font-bold text-destructive">$</span> vencido
        </span>
        <span className="flex items-center gap-1">
          <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
            $
          </span>{" "}
          vencendo em até 7 dias
        </span>
        <span className="flex items-center gap-1">
          <span className="text-sm font-bold text-success">$</span> não vencido
        </span>
      </div>

      <div data-tour="posicao-cliente-lista">
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
          // Cliente vendendo abaixo da própria média: a linha inteira em
          // amarelo, como no sistema anterior — o vermelho só no número
          // passava despercebido numa lista longa.
          rowClassName={(c) =>
            c.difMesEMedia < 0
              ? "bg-amber-500/15 hover:bg-amber-500/25 dark:bg-amber-500/10 dark:hover:bg-amber-500/20"
              : undefined
          }
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
