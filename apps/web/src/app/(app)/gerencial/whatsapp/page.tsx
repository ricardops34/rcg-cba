"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  History,
  Inbox,
  MessageSquare,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import type {
  WhatsappConversa,
  WhatsappHistoricoFiltros,
  WhatsappMensagem,
} from "@plataforma/contracts";
import { apiFetch, assetUrl } from "@/lib/api-client";
import { avatarColorClass, initials } from "@/lib/avatar-color";
import { CrudHeader } from "@/components/crud/crud-header";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { MensagemBolha } from "@/components/whatsapp/mensagem-bolha";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type ListaHistoricoConversas = {
  total: number;
  pagina: number;
  tamanho: number;
  itens: (WhatsappConversa & { vendedorAtivo?: boolean })[];
};

function telefoneBonito(digitos: string | null) {
  if (!digitos) return null;
  const d = digitos.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digitos;
}

function formatarDataHora(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function nomeExibicaoConversa(c: WhatsappConversa) {
  return (
    c.contato.clienteRazaoSocial ||
    c.contato.nomeExibicao ||
    telefoneBonito(c.contato.telefoneNormalizado) ||
    "Contato sem nome"
  );
}

export default function HistoricoWhatsappPage() {
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [vendedorId, setVendedorId] = useState<string>("todos");
  const [numero, setNumero] = useState<string>("todos");
  const [dataDe, setDataDe] = useState<string>("");
  const [dataAte, setDataAte] = useState<string>("");
  const empresaId = useAuthStore((s) => s.user?.empresaAtivaId);
  const [conversaId, setConversaId] = useState<string | null>(null);

  // Limpa filtros e seleção ao trocar de empresa
  useEffect(() => {
    setConversaId(null);
    setVendedorId("todos");
    setNumero("todos");
    setDataDe("");
    setDataAte("");
    setBusca("");
    setPagina(1);
  }, [empresaId]);

  // Filtros disponíveis (vendedores no escopo hierárquico + números)
  const { data: opcoesFiltro } = useQuery<WhatsappHistoricoFiltros>({
    queryKey: ["whatsapp-gerencial-filtros", empresaId],
    queryFn: () => apiFetch<WhatsappHistoricoFiltros>("/whatsapp/gerencial/filtros"),
    enabled: !!empresaId,
  });

  // Query das conversas auditadas
  const {
    data: dadosConversas,
    isLoading: carregandoConversas,
    isFetching: recarregandoConversas,
    refetch: recarregarConversas,
  } = useQuery<ListaHistoricoConversas>({
    queryKey: [
      "whatsapp-gerencial-conversas",
      empresaId,
      busca,
      vendedorId,
      numero,
      dataDe,
      dataAte,
      pagina,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (busca.trim()) params.set("busca", busca.trim());
      if (vendedorId && vendedorId !== "todos") params.set("vendedorId", vendedorId);
      if (numero && numero !== "todos") params.set("numero", numero);
      if (dataDe) params.set("de", dataDe);
      if (dataAte) params.set("ate", dataAte);
      params.set("pagina", String(pagina));
      params.set("tamanho", "25");
      return apiFetch<ListaHistoricoConversas>(
        `/whatsapp/gerencial/conversas?${params.toString()}`,
      );
    },
    enabled: !!empresaId,
  });

  const conversas = dadosConversas?.itens ?? [];
  const totalRegistros = dadosConversas?.total ?? 0;
  const totalPaginas = Math.ceil(totalRegistros / 25) || 1;

  // Conversa ativa selecionada
  const conversaSelecionada = useMemo(
    () => conversas.find((c) => c.id === conversaId) ?? null,
    [conversas, conversaId],
  );

  // Mensagens da conversa selecionada
  const {
    data: mensagens = [],
    isLoading: carregandoMensagens,
  } = useQuery<WhatsappMensagem[]>({
    queryKey: ["whatsapp-gerencial-mensagens", empresaId, conversaId],
    queryFn: () =>
      apiFetch<WhatsappMensagem[]>(
        `/whatsapp/gerencial/conversas/${conversaId}/mensagens?tamanho=100`,
      ),
    enabled: !!empresaId && !!conversaId,
  });

  const filtrosAtivos =
    vendedorId !== "todos" ||
    numero !== "todos" ||
    Boolean(dataDe) ||
    Boolean(dataAte);

  const limparFiltros = () => {
    setVendedorId("todos");
    setNumero("todos");
    setDataDe("");
    setDataAte("");
    setPagina(1);
  };

  return (
    <div className="flex flex-col gap-3 min-h-[calc(100dvh-5.5rem)]">
      {/* Barra de cabeçalho padrão com busca e filtros no popover */}
      <CrudHeader
        search={busca}
        onSearchChange={(v) => {
          setBusca(v);
          setPagina(1);
        }}
        placeholder="Buscar contato, cliente, telefone, vendedor ou mensagem..."
        onRefresh={() => {
          void recarregarConversas();
        }}
        isRefreshing={recarregandoConversas}
        actions={
          <FiltersPopover active={filtrosAtivos} onClear={limparFiltros}>
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">
                  Vendedor (equipe)
                </Label>
                <Select
                  value={vendedorId}
                  onValueChange={(v) => {
                    setVendedorId(v);
                    setPagina(1);
                  }}
                >
                  <SelectTrigger className="w-full mt-1 text-xs">
                    <SelectValue placeholder="Todos os vendedores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os vendedores</SelectItem>
                    {opcoesFiltro?.vendedores.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.nome} {!v.ativo ? " (Inativo)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-medium text-muted-foreground">
                  Número do WhatsApp
                </Label>
                <Select
                  value={numero}
                  onValueChange={(v) => {
                    setNumero(v);
                    setPagina(1);
                  }}
                >
                  <SelectTrigger className="w-full mt-1 text-xs">
                    <SelectValue placeholder="Todos os números" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os números</SelectItem>
                    {opcoesFiltro?.numeros.map((n) => (
                      <SelectItem key={n.numero} value={n.numero}>
                        {telefoneBonito(n.numero)}
                        {n.vendedorNome ? ` (${n.vendedorNome})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">
                    De
                  </Label>
                  <Input
                    type="date"
                    value={dataDe}
                    onChange={(e) => {
                      setDataDe(e.target.value);
                      setPagina(1);
                    }}
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">
                    Até
                  </Label>
                  <Input
                    type="date"
                    value={dataAte}
                    onChange={(e) => {
                      setDataAte(e.target.value);
                      setPagina(1);
                    }}
                    className="mt-1 text-xs"
                  />
                </div>
              </div>
            </div>
          </FiltersPopover>
        }
      />

      {/* Tags de filtros ativos para visualização rápida */}
      {filtrosAtivos && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Filtros:</span>
          {vendedorId !== "todos" && (
            <Badge variant="secondary" className="gap-1 text-xs">
              Vendedor:{" "}
              {opcoesFiltro?.vendedores.find((v) => v.id === vendedorId)?.nome ??
                vendedorId}
              <button
                type="button"
                onClick={() => setVendedorId("todos")}
                className="ml-1 hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {numero !== "todos" && (
            <Badge variant="secondary" className="gap-1 text-xs">
              Número: {telefoneBonito(numero)}
              <button
                type="button"
                onClick={() => setNumero("todos")}
                className="ml-1 hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {(dataDe || dataAte) && (
            <Badge variant="secondary" className="gap-1 text-xs">
              Período: {dataDe || "Início"} até {dataAte || "Fim"}
              <button
                type="button"
                onClick={() => {
                  setDataDe("");
                  setDataAte("");
                }}
                className="ml-1 hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={limparFiltros}
            className="text-muted-foreground hover:text-foreground h-6 px-1.5"
          >
            Limpar todos
          </Button>
        </div>
      )}

      {/* Área Master-Detail */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3 min-h-[520px] max-h-[calc(100dvh-10rem)] rounded-xl border border-border/70 overflow-hidden bg-background shadow-xs">
        {/* Painel Esquerdo: Lista de Conversas Auditadas */}
        <div
          className={`flex flex-col border-r border-border/70 bg-card/40 md:col-span-5 lg:col-span-4 min-h-0 ${
            conversaId ? "hidden md:flex" : "flex"
          }`}
        >
          {/* Topo da lista com contagem */}
          <div className="flex items-center justify-between border-b px-3.5 py-2.5 bg-muted/30">
            <span className="text-xs font-semibold text-foreground">
              Conversas registradas ({totalRegistros})
            </span>
            <span className="text-[11px] text-muted-foreground">
              Página {pagina} de {totalPaginas}
            </span>
          </div>

          {/* Lista rolável */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/40">
            {carregandoConversas ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
              </div>
            ) : conversas.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <Inbox className="size-8 mb-2 opacity-50" />
                <p className="text-sm font-medium">Nenhuma conversa encontrada</p>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-xs">
                  {filtrosAtivos
                    ? "Tente ajustar ou limpar os filtros de vendedor, número ou período."
                    : "Ainda não há conversas arquivadas nesta empresa."}
                </p>
              </div>
            ) : (
              conversas.map((c) => {
                const ativa = c.id === conversaId;
                const nome = nomeExibicaoConversa(c);

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setConversaId(c.id)}
                    className={`w-full text-left p-3 flex items-start gap-3 transition-colors hover:bg-muted/50 cursor-pointer ${
                      ativa ? "bg-muted/80 border-l-4 border-l-primary" : ""
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      className={`relative flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold shadow-2xs ${avatarColorClass(
                        nome,
                      )}`}
                    >
                      {c.contato.fotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={assetUrl(c.contato.fotoUrl) ?? undefined}
                          alt=""
                          className="size-full rounded-full object-cover"
                        />
                      ) : (
                        initials(nome)
                      )}
                    </div>

                    {/* Dados da conversa */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {nome}
                        </p>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatarDataHora(c.ultimaMensagemEm)}
                        </span>
                      </div>

                      {/* Informações adicionais de cliente e atendente */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        {c.clienteId ? (
                          <Badge
                            variant="outline"
                            className="h-4 px-1 text-[9px] font-medium border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
                          >
                            Cliente
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="h-4 px-1 text-[9px] font-medium text-amber-600 bg-amber-500/10 border-amber-500/30"
                          >
                            Sem vínculo
                          </Badge>
                        )}

                        <span className="text-[10px] text-muted-foreground truncate">
                          {c.vendedorNome}
                          {c.vendedorAtivo === false ? (
                            <span className="ml-1 text-destructive font-medium">
                              (Inativo)
                            </span>
                          ) : null}
                        </span>

                        {c.sessaoNumero ? (
                          <span className="text-[10px] text-muted-foreground/80 font-mono">
                            · {telefoneBonito(c.sessaoNumero)}
                          </span>
                        ) : null}
                      </div>

                      {/* Prévia da última mensagem */}
                      <p className="text-xs text-muted-foreground truncate">
                        {c.ultimaMensagemPrevia || "Sem mensagens"}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Paginação inferior */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between border-t px-3 py-2 bg-muted/20 text-xs">
              <Button
                variant="ghost"
                size="xs"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                className="gap-1"
              >
                <ChevronLeft className="size-3.5" /> Anterior
              </Button>
              <span className="text-muted-foreground">
                {pagina} / {totalPaginas}
              </span>
              <Button
                variant="ghost"
                size="xs"
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                className="gap-1"
              >
                Próxima <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Painel Direito: Rolo de Mensagens de Auditoria */}
        <div
          className={`flex flex-col md:col-span-7 lg:col-span-8 min-h-0 bg-background ${
            !conversaId ? "hidden md:flex" : "flex"
          }`}
        >
          {conversaSelecionada ? (
            <>
              {/* Cabeçalho da conversa selecionada */}
              <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/40">
                <div className="flex items-center gap-3 min-w-0">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setConversaId(null)}
                    className="md:hidden"
                  >
                    <ArrowLeft className="size-4" />
                  </Button>

                  <div
                    className={`relative flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold shadow-2xs ${avatarColorClass(
                      nomeExibicaoConversa(conversaSelecionada),
                    )}`}
                  >
                    {conversaSelecionada.contato.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={assetUrl(conversaSelecionada.contato.fotoUrl) ?? undefined}
                        alt=""
                        className="size-full rounded-full object-cover"
                      />
                    ) : (
                      initials(nomeExibicaoConversa(conversaSelecionada))
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-foreground truncate">
                        {nomeExibicaoConversa(conversaSelecionada)}
                      </h2>
                      {conversaSelecionada.clienteId && (
                        <Badge
                          variant="outline"
                          className="h-4 px-1.5 text-[9px] font-medium border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
                        >
                          Cliente
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2">
                      <span>
                        Contato: {telefoneBonito(conversaSelecionada.contato.telefoneNormalizado)}
                      </span>
                      <span>· Atendente: {conversaSelecionada.vendedorNome}</span>
                      {conversaSelecionada.sessaoNumero ? (
                        <span>· Conexão: {telefoneBonito(conversaSelecionada.sessaoNumero)}</span>
                      ) : null}
                    </p>
                  </div>
                </div>

                {/* Ações rápidas do gestor */}
                {conversaSelecionada.clienteId ? (
                  <Button
                    variant="outline"
                    size="xs"
                    asChild
                    className="shrink-0 gap-1.5 text-xs"
                  >
                    <Link
                      href={`/comercial/posicao-cliente?clienteId=${conversaSelecionada.clienteId}`}
                    >
                      <ExternalLink className="size-3" />
                      Posição do cliente
                    </Link>
                  </Button>
                ) : null}
              </div>

              {/* Rolo de mensagens auditadas */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#EFEAE2]/60 dark:bg-[#0B141A]/70">
                {carregandoMensagens ? (
                  <div className="space-y-4">
                    <Skeleton className="h-12 w-2/3 rounded-xl" />
                    <Skeleton className="h-16 w-1/2 ml-auto rounded-xl" />
                    <Skeleton className="h-12 w-3/4 rounded-xl" />
                  </div>
                ) : mensagens.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                    <MessageSquare className="size-8 mb-2 opacity-50" />
                    <p className="text-sm font-medium">Nenhuma mensagem registrada</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Esta conversa ainda não possui mensagens no banco de dados.
                    </p>
                  </div>
                ) : (
                  mensagens.map((m) => (
                    <MensagemBolha
                      key={m.id}
                      mensagem={m}
                      autorNome={m.autorNome}
                      citada={
                        m.respondeuA
                          ? mensagens.find((item) => item.externoId === m.respondeuA) ?? null
                          : null
                      }
                      conversaId={conversaSelecionada.id}
                      somenteLeitura={true}
                    />
                  ))
                )}
              </div>

              {/* Barra inferior fixa de auditoria */}
              <div className="flex items-center justify-between border-t px-4 py-2.5 bg-muted/50 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-medium text-foreground">
                    Auditoria Gerencial
                  </span>
                  <span>· Registro permanente de mensagens (somente leitura)</span>
                </div>
                <span className="font-mono text-[11px]">
                  {mensagens.length} mensagem(ns)
                </span>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
                <History className="size-7" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Histórico permanente do WhatsApp
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Selecione uma conversa na lista lateral para auditar o rolo completo de
                mensagens, mídias e conexões utilizadas pelo vendedor.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
