"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Orcamento, StatusOrcamento } from "@plataforma/contracts";
import {
  numeroOrcamento,
  podeExcluirOrcamento,
  ORIGEM_VENDA_ROTULO,
  SITUACAO_INTEGRACAO_ROTULO,
  situacaoIntegracaoOrcamento,
} from "@plataforma/contracts";
import { useResourceList, useResourceMutations } from "@/hooks/use-resource";
import { ApiError, apiFetch } from "@/lib/api-client";
import { dataCivilBr } from "@/lib/data";
import {
  useVendedoresEscopo,
  vendedorFiltroLabel,
} from "@/hooks/use-vendedores-escopo";
import { CrudHeader } from "@/components/crud/crud-header";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { StatusDot } from "@/components/crud/status-dot";
import {
  StatusQuickFilter,
  type StatusFilterValue,
} from "@/components/crud/status-quick-filter";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { useFiltrosUrl } from "@/hooks/use-filtros-url";
import {
  SITUACAO_INTEGRACAO_VISUAL,
  STATUS_ORCAMENTO,
  STATUS_ORCAMENTO_LABEL,
  STATUS_ORCAMENTO_VARIANT,
} from "@/components/crud/orcamento-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2,
  Copy,
  Link2,
  Eye,
  MoreHorizontal,
  Pencil,
  Trash2,
  XCircle,
} from "lucide-react";

type StatusFiltro = "todos" | StatusOrcamento;
type SituacaoFiltro = "todas" | "aberto" | "vencido" | "faturado";

/** Datas de um filtro de período (AAAA-MM-DD, como o campo de data entrega). */
interface Periodo {
  de: string;
  ate: string;
}
const SEM_PERIODO: Periodo = { de: "", ate: "" };

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = dataCivilBr;

// Acompanhamento do pedido no ERP (situacaoIntegracaoOrcamento): só faz
// sentido depois de aprovado, que é quando o orçamento vai ao ERP. A marca de
// quebra acompanha a situação na legenda.
function integracaoIndicador(o: Orcamento) {
  const situacao = situacaoIntegracaoOrcamento(o);
  if (situacao === "nao_enviado") return null;
  const visual = SITUACAO_INTEGRACAO_VISUAL[situacao];
  let legenda = SITUACAO_INTEGRACAO_ROTULO[situacao];
  if (o.comQuebra) legenda += " — com quebra";
  if (o.codigoErp) legenda += ` (pedido ${o.codigoErp})`;
  if (situacao === "erro_integracao" && o.erroIntegracao) {
    legenda += `: ${o.erroIntegracao}`;
  }
  return { icone: visual.icone, cor: visual.cor, legenda };
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
  const [situacao, setSituacao] = useState<SituacaoFiltro>("todas");
  const [criado, setCriado] = useState<Periodo>(SEM_PERIODO);
  const [validade, setValidade] = useState<Periodo>(SEM_PERIODO);
  const [retorno, setRetorno] = useState<Periodo>(SEM_PERIODO);
  const [clienteId] = useState(() => urlFiltros.texto("clienteId"));
  const [vendedorId, setVendedorId] = useState<string | undefined>(() =>
    urlFiltros.texto("vendedorId"),
  );

  const vendedoresEscopoQuery = useVendedoresEscopo();
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];
  const mostrarFiltroVendedor = !(
    vendedoresEscopoQuery.data?.ehVendedorPuro ?? false
  );

  const { data, isLoading, isFetching, refetch, error } =
    useResourceList<Orcamento>("orcamentos", {
      search,
      page,
      pageSize,
      sortBy,
      sortOrder,
      ...(status_ !== "todos" ? { ativo: status_ === "ativos" } : {}),
      ...(statusOrcamento !== "todos" ? { status: statusOrcamento } : {}),
      ...(situacao !== "todas" ? { situacao } : {}),
      ...(criado.de ? { dataInicio: criado.de } : {}),
      // O dia inteiro: "até 15/10" inclui o que foi criado durante o dia 15.
      ...(criado.ate ? { dataFim: `${criado.ate}T23:59:59` } : {}),
      ...(validade.de ? { validadeInicio: validade.de } : {}),
      ...(validade.ate ? { validadeFim: validade.ate } : {}),
      ...(retorno.de ? { retornoInicio: retorno.de } : {}),
      ...(retorno.ate ? { retornoFim: retorno.ate } : {}),
      ...(clienteId ? { clienteId } : {}),
      ...(vendedorId ? { vendedorId } : {}),
    });

  const { remove, update } = useResourceMutations<
    unknown,
    { status: StatusOrcamento }
  >("orcamentos");

  const queryClient = useQueryClient();
  const abrirEdicao = (o: Orcamento) => router.push(`/crm/orcamentos/${o.id}`);
  // Abre o formulário já em modo cópia: novo orçamento em rascunho, com o
  // cliente e os itens deste. É o caminho para aprovado, vencido e o
  // histórico do ERP, que não se editam.
  const abrirCopia = (o: Orcamento) =>
    router.push(`/crm/orcamentos/${o.id}?copiar=1`);

  // Aprovar (efetivar) e recusar mudam só o status. É o mesmo PATCH da tela de
  // edição, então valem as mesmas regras do servidor: a trava de desconto
  // volta como 409 com a mensagem pronta.
  const mudarStatus = async (o: Orcamento, status: "aprovado" | "recusado") => {
    const acao = status === "aprovado" ? "Aprovar" : "Recusar";
    if (!confirm(`${acao} o orçamento Nº ${numeroOrcamento(o)}?`)) return;
    try {
      await update.mutateAsync({ id: o.id, input: { status } });
      toast.success(
        status === "aprovado" ? "Orçamento aprovado" : "Orçamento recusado",
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : `Erro ao ${acao.toLowerCase()} o orçamento`,
      );
    }
  };

  // Gera (ou recupera) o link público e copia para a área de transferência: o
  // vendedor cola onde quiser (WhatsApp, e-mail). Orçamento com pendência de
  // desconto volta 409 com o motivo.
  const copiarLinkCliente = async (o: Orcamento) => {
    try {
      const { token } = await apiFetch<{ token: string }>(
        `/orcamentos/${o.id}/link`,
        { method: "POST" },
      );
      const url = `${window.location.origin}/o/${token}`;
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado — cole na mensagem para o cliente");
      // Gerar o link passa o rascunho para enviado.
      void queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Erro ao gerar o link",
      );
    }
  };

  const onDelete = async (o: Orcamento) => {
    if (!confirm(`Excluir o orçamento Nº ${numeroOrcamento(o)}?`)) return;
    try {
      await remove.mutateAsync(o.id);
      toast.success("Orçamento excluído");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Erro ao excluir orçamento",
      );
    }
  };

  const filtrosAtivos =
    statusOrcamento !== "todos" ||
    situacao !== "todas" ||
    !!vendedorId ||
    [criado, validade, retorno].some((p) => p.de || p.ate);
  const limparFiltros = () => {
    setStatusOrcamento("todos");
    setSituacao("todas");
    setCriado(SEM_PERIODO);
    setValidade(SEM_PERIODO);
    setRetorno(SEM_PERIODO);
    setVendedorId(undefined);
    setPage(1);
  };
  /** Par de datas "de — até" de um filtro de período. */
  const campoPeriodo = (
    rotulo: string,
    valor: Periodo,
    alterar: (p: Periodo) => void,
  ) => (
    <div className="space-y-2">
      <FieldLabel>{rotulo}</FieldLabel>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="date"
          aria-label={`${rotulo} — de`}
          value={valor.de}
          max={valor.ate || undefined}
          onChange={(e) => {
            alterar({ ...valor, de: e.target.value });
            setPage(1);
          }}
        />
        <Input
          type="date"
          aria-label={`${rotulo} — até`}
          value={valor.ate}
          min={valor.de || undefined}
          onChange={(e) => {
            alterar({ ...valor, ate: e.target.value });
            setPage(1);
          }}
        />
      </div>
    </div>
  );

  const menuAcoes = (o: Orcamento) => (
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
      <DropdownMenuContent align="end">
        {o.status === "aprovado" || o.status === "expirado" ? (
          <DropdownMenuItem onClick={() => abrirEdicao(o)}>
            <Eye className="size-4" /> Visualizar
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => abrirEdicao(o)}>
            <Pencil className="size-4" /> Editar
          </DropdownMenuItem>
        )}
        {/* Aprovado é definitivo e vencido só se copia — o servidor recusa. */}
        {o.status !== "aprovado" && o.status !== "expirado" && (
          <DropdownMenuItem onClick={() => mudarStatus(o, "aprovado")}>
            <CheckCircle2 className="size-4" /> Aprovar
          </DropdownMenuItem>
        )}
        {o.status !== "aprovado" &&
          o.status !== "expirado" &&
          o.status !== "recusado" && (
            <DropdownMenuItem onClick={() => mudarStatus(o, "recusado")}>
              <XCircle className="size-4" /> Recusar
            </DropdownMenuItem>
          )}
        {(o.status === "rascunho" || o.status === "enviado") && (
          <DropdownMenuItem onClick={() => copiarLinkCliente(o)}>
            <Link2 className="size-4" /> Link para o cliente
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => abrirCopia(o)}>
          <Copy className="size-4" /> Copiar
        </DropdownMenuItem>
        {/* Só sem integração — o servidor recusa o resto (409) */}
        {podeExcluirOrcamento(o) && (
          <DropdownMenuItem variant="destructive" onClick={() => onDelete(o)}>
            <Trash2 className="size-4" /> Excluir
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns: ColumnDef<Orcamento>[] = [
    {
      header: "Nº",
      sortKey: "numero",
      className: "w-16",
      cell: (o) => <span className="font-mono text-xs">{numeroOrcamento(o)}</span>,
    },
    {
      header: "Cliente",
      cell: (o) => (
        <span className="text-xs">
          {o.cliente.nomeFantasia || o.cliente.razaoSocial}
        </span>
      ),
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
        <Badge variant={STATUS_ORCAMENTO_VARIANT[o.status]}>
          {STATUS_ORCAMENTO_LABEL[o.status]}
        </Badge>
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
    {
      header: "Válido até",
      sortKey: "dataValidade",
      cell: (o) => dataBr(o.dataValidade),
    },
    {
      header: "Ativo",
      sortKey: "ativo",
      cell: (o) => <StatusDot active={o.ativo} />,
    },
    {
      header: "",
      className: "w-10",
      cell: (o) => menuAcoes(o),
    },
  ];

  return (
    <div className="space-y-4">
      <div data-tour="orcamentos-busca">
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
          actions={
            <FiltersPopover active={filtrosAtivos} onClear={limparFiltros}>
              <div className="space-y-2">
                <FieldLabel>Situação</FieldLabel>
                <Select
                  value={situacao}
                  onValueChange={(v) => {
                    setSituacao(v as SituacaoFiltro);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    <SelectItem value="aberto">Abertos (dentro da validade)</SelectItem>
                    <SelectItem value="vencido">Vencidos</SelectItem>
                    <SelectItem value="faturado">Faturados</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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

              {campoPeriodo("Criado entre", criado, setCriado)}
              {campoPeriodo("Válido até entre", validade, setValidade)}
              {campoPeriodo("Retorno entre", retorno, setRetorno)}
            </FiltersPopover>
          }
        />
      </div>

      <div
        data-tour="orcamentos-filtros"
        className="flex flex-wrap items-center justify-between gap-2"
      >
        <StatusQuickFilter
          value={status_}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </div>

      <div data-tour="orcamentos-lista">
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
          mobileCard={(o) => {
            const indicador = integracaoIndicador(o);
            const Icone = indicador?.icone;
            return (
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      Nº {numeroOrcamento(o)}
                    </span>
                    <Badge variant={STATUS_ORCAMENTO_VARIANT[o.status]}>
                      {STATUS_ORCAMENTO_LABEL[o.status]}
                    </Badge>
                    {indicador && Icone ? (
                      <Icone className={`size-4 ${indicador.cor}`} aria-label={indicador.legenda} />
                    ) : null}
                    {!o.ativo ? <span className="text-xs text-muted-foreground">inativo</span> : null}
                  </div>
                  <p className="break-words text-sm font-medium">
                    {o.cliente.nomeFantasia || o.cliente.razaoSocial}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {o.vendedor.nomeReduzido || o.vendedor.nome}
                    {o.dataValidade ? ` · válido até ${dataBr(o.dataValidade)}` : ""}
                  </p>
                  {o.dataRetorno ? (
                    <p className="text-xs text-muted-foreground">
                      Retorno{" "}
                      {new Date(o.dataRetorno).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-semibold tabular-nums">{moeda(o.vlrTotal)}</span>
                  {menuAcoes(o)}
                </div>
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}
