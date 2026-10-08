"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  CalendarCheck2,
  Camera,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Download,
  Link2,
  Loader2,
  MessageCircle,
  MessageSquarePlus,
  MoreVertical,
  PanelLeftClose,
  Pencil,
  Plug,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Unlink,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  ClienteContato,
  WhatsappConversa,
  WhatsappSessao,
} from "@plataforma/contracts";
import { ApiError, apiFetch, assetUrl } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { avatarColorClass, initials } from "@/lib/avatar-color";
import { ClienteCombobox } from "@/components/crud/cliente-combobox";
import { OrcamentoFormContent } from "@/components/crud/orcamento-form";
import { PosicaoClienteConteudo } from "@/components/comercial/posicao-cliente-conteudo";
import { ColunaRedimensionavel } from "@/components/ui/coluna-redimensionavel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import { ConexaoSheet } from "@/components/whatsapp/conexao-sheet";
import { NovaConversaDialog } from "@/components/whatsapp/nova-conversa-dialog";
import {
  Conversa,
  nomeDaConversa,
  telefoneBonito,
} from "@/components/whatsapp/conversa-painel";

type ListaConversas = {
  total: number;
  itens: WhatsappConversa[];
};

type FiltroConversas =
  | "todas"
  | "nao_lidas"
  | "sem_vinculo"
  | "retornos"
  | "aprovacoes";

/** Onde a preferência de painel aberto/fechado é lembrada entre sessões. */
const PREF_LISTA = "atendimento-lista-aberta";

/** Quem redesenha quando uma preferência muda (o localStorage não avisa). */
const ouvintesDePreferencia = new Set<() => void>();

function usePainelAberto(chave: string): [boolean, () => void] {
  const aberto = useSyncExternalStore(
    (redesenhar) => {
      ouvintesDePreferencia.add(redesenhar);
      return () => ouvintesDePreferencia.delete(redesenhar);
    },
    () => localStorage.getItem(chave) !== "0",
    () => true,
  );

  const alternar = () => {
    localStorage.setItem(chave, aberto ? "0" : "1");
    ouvintesDePreferencia.forEach((redesenhar) => redesenhar());
  };

  return [aberto, alternar];
}

/**
 * Atendimento por WhatsApp — experiência fluida e nativa no estilo WhatsApp Web,
 * integrando a plataforma comercial diretamente ao atendimento: dados do cliente,
 * emissão de orçamentos e histórico de conversas gravado no ERP.
 */
export default function AtendimentoPage() {
  // A tela é da instância do usuário logado (empresa + usuário + vendedor +
  // número) e segue os direitos dele: responder e iniciar conversa pedem
  // `cadastrar`; conectar, importar e vincular pedem `editar`. A equipe se
  // acompanha em Gerencial → Histórico do WhatsApp, só leitura.
  const podeEnviar = useAuthStore(
    (state) => state.user?.permissoes.includes("whatsapp-conversas.cadastrar") ?? false,
  );
  const podeEditar = useAuthStore(
    (state) => state.user?.permissoes.includes("whatsapp-conversas.editar") ?? false,
  );
  const empresaId = useAuthStore((state) => state.user?.empresaAtivaId);
  const [conexaoAberta, setConexaoAberta] = useState(false);
  const [novaConversaAberta, setNovaConversaAberta] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const conversaId = useSearchParams().get("conversa");
  const abrirConversa = useCallback(
    (id: string | null) =>
      router.replace(id ? `${pathname}?conversa=${id}` : pathname, {
        scroll: false,
      }),
    [router, pathname],
  );
  const [busca, setBusca] = useState("");
  const [filtroConversas, setFiltroConversas] =
    useState<FiltroConversas>("todas");
  const [listaPreferida, alternarPreferenciaLista] = usePainelAberto(PREF_LISTA);

  const [ignorandoPreferencia, setIgnorandoPreferencia] = useState(
    () => !!conversaId,
  );
  const listaAberta = listaPreferida && !ignorandoPreferencia;
  const alternarLista = () => {
    if (ignorandoPreferencia) {
      setIgnorandoPreferencia(false);
      if (!listaPreferida) alternarPreferenciaLista();
      return;
    }
    alternarPreferenciaLista();
  };

  const [painelDireito, setPainelDireito] = useState<
    "contato" | "posicao" | "orcamento"
  >("contato");
  const [painelMovelAberto, setPainelMovelAberto] = useState(false);

  const abrirPainel = useCallback(
    (modo: "contato" | "posicao" | "orcamento") => {
      setPainelDireito(modo);
      setPainelMovelAberto(true);
    },
    [],
  );

  const fecharFerramenta = useCallback(() => {
    setPainelDireito("contato");
    setPainelMovelAberto(false);
  }, []);

  const {
    data: sessao,
    isLoading: carregandoSessao,
    error: erroSessao,
  } = useQuery({
    queryKey: ["whatsapp-sessao", empresaId],
    queryFn: () => apiFetch<WhatsappSessao | null>("/whatsapp/sessao"),
    retry: false,
    enabled: !!empresaId,
    refetchInterval: (q) =>
      q.state.data?.status === "pareando" ? 3000 : false,
  });

  // Uma instância só: a do usuário logado. Sem seletor de "conexões da
  // equipe" — foi ele que misturou conversas de vendedores nesta tela.
  const sessaoAtivaId = sessao?.id ?? null;
  const sessaoAtiva = sessao ?? null;

  const { data: conversas, isLoading: carregandoConversas } = useQuery({
    queryKey: ["whatsapp-conversas", empresaId, busca, sessaoAtivaId, filtroConversas],
    queryFn: () => {
      const params = new URLSearchParams();
      if (busca) params.set("busca", busca);
      if (filtroConversas === "sem_vinculo") params.set("semVinculo", "true");
      if (sessaoAtivaId) params.set("sessaoId", sessaoAtivaId);
      const qs = params.toString();
      return apiFetch<ListaConversas>(
        `/whatsapp/conversas${qs ? `?${qs}` : ""}`,
      );
    },
    enabled: !!empresaId && !!sessaoAtivaId,
    refetchInterval: 15000,
  });

  const { data: conversaAvulsa } = useQuery({
    queryKey: ["whatsapp-conversa", empresaId, conversaId],
    queryFn: () =>
      apiFetch<WhatsappConversa>(`/whatsapp/conversas/${conversaId}`),
    enabled: !!empresaId && !!conversaId && !conversas?.itens.some((c) => c.id === conversaId),
  });

  const conversaSelecionada =
    conversas?.itens.find((c) => c.id === conversaId) ?? conversaAvulsa ?? null;

  if (
    carregandoSessao ||
    (sessao && sessao.status !== "conectada" && carregandoConversas)
  ) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  const temConversasAnteriores = (conversas?.total ?? 0) > 0;

  if (
    !sessao ||
    (sessao.status !== "conectada" && !temConversasAnteriores)
  ) {
    const mensagemSemSessao =
      erroSessao instanceof ApiError
        ? erroSessao.message
        : podeEditar
          ? "Conecte o aparelho para atender seus clientes por aqui. As conversas com clientes ficam gravadas na plataforma."
          : "Seu perfil não tem permissão para conectar o WhatsApp. Peça ao administrador.";
    return (
      <>
        <div data-tour="atendimento-conexao" className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-card/60 p-12 text-center backdrop-blur-xs">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MessageCircle className="size-7" />
          </div>
          <div>
            <p className="font-semibold text-foreground">
              {erroSessao ? "WhatsApp indisponível para este usuário" : "Seu WhatsApp não está conectado"}
            </p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {mensagemSemSessao}
            </p>
          </div>
          {!erroSessao && podeEditar ? (
            <Button
              className="gap-2 bg-[#00A884] hover:bg-[#008f6f] text-white font-medium shadow-xs"
              onClick={() => setConexaoAberta(true)}
            >
              <Plug className="size-4" />
              Conectar WhatsApp
            </Button>
          ) : null}
        </div>
        <ConexaoSheet
          aberto={conexaoAberta}
          onOpenChange={setConexaoAberta}
          sessao={sessao ?? null}
        />
      </>
    );
  }

  return (
    <>
      {sessao.status !== "conectada" ? (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-4 shrink-0" />
            <span>
              <strong>WhatsApp desconectado:</strong> Exibindo histórico anterior em modo somente leitura.
            </span>
          </div>
          {podeEditar ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 border-amber-500/40 hover:bg-amber-500/20 text-xs"
              onClick={() => setConexaoAberta(true)}
            >
              <Plug className="size-3.5" />
              Reconectar
            </Button>
          ) : null}
        </div>
      ) : null}
      {/* Moldura principal preenchendo a altura disponível perfeitamente, sem folgas inferiores */}
      <div className="flex h-[calc(100dvh-5.25rem)] sm:h-[calc(100dvh-5.75rem)] lg:h-[calc(100dvh-6.75rem)] w-full flex-col overflow-hidden rounded-xl border border-border/70 bg-background shadow-sm">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          {listaAberta || !conversaId ? (
            <ColunaRedimensionavel
              larguraPadrao={380}
              larguraMinima={300}
              chaveArmazenamento="atendimento-largura-lista"
              lado="esquerda"
              className={conversaId ? "hidden md:block" : "block max-md:!w-full"}
            >
              <ListaDeConversas
                carregando={carregandoConversas}
                conversas={conversas?.itens ?? []}
                selecionada={conversaId}
                onSelecionar={abrirConversa}
                filtro={filtroConversas}
                onFiltroChange={setFiltroConversas}
                busca={busca}
                onBuscaChange={setBusca}
                onNovaConversa={podeEnviar ? () => setNovaConversaAberta(true) : undefined}
                onAbrirConexao={podeEditar ? () => setConexaoAberta(true) : undefined}
                podeImportar={podeEditar}
                sessaoNumero={sessaoAtiva?.numero ?? sessao?.numero}
                sessaoStatus={sessaoAtiva?.status ?? null}
                onAlternarLista={alternarLista}
              />
            </ColunaRedimensionavel>
          ) : null}

          <div
            className={`h-full min-h-0 min-w-0 flex-1 ${
              conversaId ? "block" : "hidden md:block"
            }`}
          >
            <Conversa
              conversaId={conversaId}
              conversa={conversaSelecionada}
              clienteId={conversaSelecionada?.clienteId ?? null}
              somenteConsulta={
                sessaoAtiva?.status !== "conectada"
                  ? {
                      vendedorNome:
                        conversaSelecionada?.vendedorNome ?? "Aparelho desconectado",
                      motivo: "desconectado",
                    }
                  : !podeEnviar
                    ? {
                        vendedorNome: conversaSelecionada?.vendedorNome ?? "",
                        motivo: "sem-permissao",
                      }
                    : null
              }
              onVoltarLista={() => abrirConversa(null)}
              onAbrirContato={() => abrirPainel("contato")}
              onAbrirPosicao={() => abrirPainel("posicao")}
              onAbrirOrcamento={() => abrirPainel("orcamento")}
              onNovaConversa={podeEnviar ? () => setNovaConversaAberta(true) : undefined}
              sessaoNumero={sessaoAtiva?.numero ?? sessao?.numero}
              listaAberta={listaAberta}
              onAlternarLista={alternarLista}
            />
          </div>
        </div>
      </div>

      <Sheet open={painelMovelAberto} onOpenChange={setPainelMovelAberto}>
        <ResizableSheetContent
          defaultWidth={
            painelDireito === "contato"
              ? 440
              : painelDireito === "posicao"
                ? 1040
                : 1180
          }
          storageKey="atendimento-largura-cortina"
          minWidth={420}
          maxWidthRatio={0.96}
          className="p-0"
        >
          <SheetHeader className="shrink-0 border-b pr-14">
            <SheetTitle>{tituloDoPainel(painelDireito)}</SheetTitle>
            <SheetDescription>
              Consulte e trabalhe sem perder a conversa em andamento.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            {painelDireito === "contato" ? (
              <PainelCliente conversa={conversaSelecionada ?? null} emCortina />
            ) : conversaSelecionada?.clienteId ? (
              <ConteudoFerramenta
                clienteId={conversaSelecionada.clienteId}
                modo={painelDireito}
                onFechar={fecharFerramenta}
              />
            ) : null}
          </div>
        </ResizableSheetContent>
      </Sheet>

      <ConexaoSheet
        aberto={conexaoAberta}
        onOpenChange={setConexaoAberta}
        sessao={sessao ?? null}
      />
      <NovaConversaDialog
        aberto={novaConversaAberta}
        onOpenChange={setNovaConversaAberta}
        onAbrirConversa={abrirConversa}
      />
    </>
  );
}

function ListaDeConversas({
  carregando,
  conversas,
  selecionada,
  onSelecionar,
  filtro,
  onFiltroChange,
  busca,
  onBuscaChange,
  onNovaConversa,
  onAbrirConexao,
  podeImportar,
  sessaoNumero,
  sessaoStatus,
  onAlternarLista,
}: {
  carregando: boolean;
  conversas: WhatsappConversa[];
  selecionada: string | null;
  onSelecionar: (id: string) => void;
  filtro: FiltroConversas;
  onFiltroChange: (filtro: FiltroConversas) => void;
  busca: string;
  onBuscaChange: (busca: string) => void;
  /** Ausente quando o usuário não pode iniciar conversa (`cadastrar`). */
  onNovaConversa?: () => void;
  /** Ausente quando o usuário não pode conectar (`editar`). */
  onAbrirConexao?: () => void;
  podeImportar: boolean;
  sessaoNumero?: string | null;
  sessaoStatus?: WhatsappSessao["status"] | null;
  onAlternarLista?: () => void;
}) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const [podeRolarEsquerda, setPodeRolarEsquerda] = useState(false);
  const [podeRolarDireita, setPodeRolarDireita] = useState(false);
  const [dialogImportarAberto, setDialogImportarAberto] = useState(false);
  const queryClient = useQueryClient();

  const importarMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; total: number; criados: number; atualizados: number }>(
        "/whatsapp/agenda/importar",
        {
          method: "POST",
          // Sem `sessaoId`: a API importa sempre na instância do usuário.
          body: {},
        },
      ),
    onSuccess: (res) => {
      toast.success(
        res.total === 0
          ? "Nenhum contato encontrado no aparelho."
          : `${res.criados} novos contatos importados (${res.atualizados} já existentes atualizados).`,
      );
      void queryClient.invalidateQueries({
        queryKey: ["whatsapp-conversas"],
      });
      setDialogImportarAberto(false);
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Não foi possível importar contatos da conexão.",
      );
    },
  });

  const verificarRolagem = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setPodeRolarEsquerda(scrollLeft > 2);
    setPodeRolarDireita(scrollLeft + clientWidth < scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    verificarRolagem();
    el.addEventListener("scroll", verificarRolagem, { passive: true });
    const ro = new ResizeObserver(verificarRolagem);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", verificarRolagem);
      ro.disconnect();
    };
  }, [verificarRolagem]);

  const rolarTabs = (direcao: "esquerda" | "direita") => {
    const el = tabsRef.current;
    if (!el) return;
    const passo = 130;
    el.scrollBy({ left: direcao === "esquerda" ? -passo : passo, behavior: "smooth" });
  };

  const handleTabsWheel = (e: React.WheelEvent) => {
    if (tabsRef.current && e.deltaY !== 0) {
      tabsRef.current.scrollLeft += e.deltaY;
    }
  };

  const visiveis = conversas.filter((conversa) => {
    if (filtro === "nao_lidas") return conversa.naoLidas > 0;
    if (filtro === "sem_vinculo") return !conversa.clienteId;
    if (filtro === "retornos") return !!conversa.proximoRetornoEm;
    if (filtro === "aprovacoes") return conversa.orcamentoAguardandoAprovacao;
    return true;
  });

  const contagemNaoLidas = conversas.reduce((acc, c) => acc + (c.naoLidas > 0 ? 1 : 0), 0);
  const contagemSemVinculo = conversas.reduce((acc, c) => acc + (!c.clienteId ? 1 : 0), 0);
  const contagemRetornos = conversas.reduce((acc, c) => acc + (c.proximoRetornoEm ? 1 : 0), 0);
  const contagemAprovacoes = conversas.reduce((acc, c) => acc + (c.orcamentoAguardandoAprovacao ? 1 : 0), 0);

  // Recalcular estado de rolagem ao atualizar contagens ou conversas
  useEffect(() => {
    verificarRolagem();
  }, [verificarRolagem, conversas.length, contagemNaoLidas, contagemSemVinculo, contagemRetornos, contagemAprovacoes]);

  return (
    <div className="flex h-full w-full flex-col border-r border-border/60 bg-card/40">
      {/* Cabeçalho superior da lista estilo WhatsApp Web */}
      <div className="shrink-0 bg-[#F0F2F5] dark:bg-[#202C33] border-b border-border/40">
        <div className="flex h-14 items-center justify-between px-3.5">
          <div className="flex items-center gap-2">
            {onAlternarLista ? (
              <Button
                variant="ghost"
                size="icon"
                title="Ocultar painel de conversas"
                onClick={onAlternarLista}
                className="hidden md:inline-flex size-8 text-muted-foreground hover:text-foreground"
              >
                <PanelLeftClose className="size-4" />
              </Button>
            ) : null}
            <span className="text-base font-bold text-foreground tracking-tight select-none">
              WhatsApp
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* A cor segue o status: verde piscando em qualquer estado fazia o
                "Conectar" parecer conectado, e ninguém via que é por aqui que
                se reconecta. */}
            <button
              type="button"
              onClick={onAbrirConexao}
              disabled={!onAbrirConexao}
              title={
                sessaoStatus === "conectada"
                  ? "WhatsApp conectado"
                  : sessaoStatus === "pareando"
                    ? "Aguardando leitura do QR — clique para ver"
                    : "WhatsApp desconectado — clique para conectar"
              }
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                sessaoStatus === "conectada"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                  : sessaoStatus === "pareando"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                    : "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
              }`}
            >
              <span className="relative flex size-2">
                {sessaoStatus === "conectada" ? (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                ) : null}
                <span
                  className={`relative inline-flex size-2 rounded-full ${
                    sessaoStatus === "conectada"
                      ? "bg-emerald-500"
                      : sessaoStatus === "pareando"
                        ? "bg-amber-500"
                        : "bg-destructive"
                  }`}
                />
              </span>
              <span className="max-w-[120px] truncate">
                {sessaoStatus === "conectada"
                  ? sessaoNumero
                    ? telefoneBonito(sessaoNumero)
                    : "Conectado"
                  : sessaoStatus === "pareando"
                    ? "Ler QR"
                    : "Desconectado — conectar"}
              </span>
            </button>

            {onNovaConversa ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={onNovaConversa}
                title="Nova conversa"
                className="size-8 rounded-full text-foreground hover:bg-black/5 dark:hover:bg-white/10"
              >
                <MessageSquarePlus className="size-4.5" />
              </Button>
            ) : null}

            {onNovaConversa || onAbrirConexao || podeImportar ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="Mais opções"
                  className="size-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {onNovaConversa ? (
                  <DropdownMenuItem onClick={onNovaConversa} className="gap-2 cursor-pointer">
                    <MessageSquarePlus className="size-4" />
                    Nova conversa
                  </DropdownMenuItem>
                ) : null}
                {onAbrirConexao ? (
                  <DropdownMenuItem onClick={onAbrirConexao} className="gap-2 cursor-pointer">
                    <Plug className="size-4" />
                    Conexão WhatsApp
                  </DropdownMenuItem>
                ) : null}
                {podeImportar ? (
                  <DropdownMenuItem
                    onClick={() => setDialogImportarAberto(true)}
                    className="gap-2 cursor-pointer"
                  >
                    <Download className="size-4" />
                    Importar contatos do WhatsApp
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            ) : null}
          </div>
        </div>

        {/* Campo de pesquisa estilo WhatsApp Web */}
        <div data-tour="atendimento-controles" className="px-3 pb-2 pt-0.5">
          <div className="relative flex items-center rounded-lg bg-background dark:bg-[#111B21] border border-border/40 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all">
            <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground/70" />
            <Input
              value={busca}
              onChange={(e) => onBuscaChange(e.target.value)}
              placeholder="Pesquisar ou começar uma nova conversa"
              className="h-8.5 w-full rounded-lg border-0 bg-transparent pl-9 pr-8 text-xs placeholder:text-muted-foreground/70 shadow-none focus-visible:ring-0"
            />
            {busca ? (
              <button
                type="button"
                onClick={() => onBuscaChange("")}
                className="absolute right-2.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Limpar pesquisa"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Abas de filtro estilo WhatsApp Web (Pills com rolagem horizontal) */}
        <div className="relative border-t border-border/30 bg-[#F0F2F5]/80 dark:bg-[#202C33]/80">
          {podeRolarEsquerda ? (
            <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center bg-gradient-to-r from-[#F0F2F5] via-[#F0F2F5]/90 to-transparent dark:from-[#202C33] dark:via-[#202C33]/90 pl-1 pr-3">
              <button
                type="button"
                onClick={() => rolarTabs("esquerda")}
                className="flex size-6 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground border border-border/50 transition-colors cursor-pointer"
                title="Rolar filtros para a esquerda"
                aria-label="Rolar filtros para a esquerda"
              >
                <ChevronLeft className="size-3.5" />
              </button>
            </div>
          ) : null}

          <div
            ref={tabsRef}
            onWheel={handleTabsWheel}
            className="flex items-center gap-1.5 overflow-x-auto px-3 py-2 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {(
              [
                ["todas", "Tudo", conversas.length],
                ["nao_lidas", "Não lidas", contagemNaoLidas],
                ["sem_vinculo", "Sem vínculo", contagemSemVinculo],
                ["retornos", "Retornos", contagemRetornos],
                ["aprovacoes", "Aprovações", contagemAprovacoes],
              ] as const
            ).map(([valor, rotulo, qtd]) => {
              const ativo = filtro === valor;
              return (
                <button
                  key={valor}
                  type="button"
                  onClick={(e) => {
                    onFiltroChange(valor);
                    e.currentTarget.scrollIntoView({
                      behavior: "smooth",
                      block: "nearest",
                      inline: "nearest",
                    });
                  }}
                  className={`h-7 shrink-0 rounded-full px-2.5 text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    ativo
                      ? "bg-[#E9EDEF] dark:bg-[#374248] text-[#111B21] dark:text-[#E9EDEF] font-semibold shadow-2xs"
                      : "border border-border/50 bg-transparent text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  <span>{rotulo}</span>
                  {qtd > 0 && valor !== "todas" ? (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                        ativo
                          ? "bg-emerald-600 text-white"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {qtd}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {podeRolarDireita ? (
            <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center bg-gradient-to-l from-[#F0F2F5] via-[#F0F2F5]/90 to-transparent dark:from-[#202C33] dark:via-[#202C33]/90 pr-1 pl-3">
              <button
                type="button"
                onClick={() => rolarTabs("direita")}
                className="flex size-6 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground border border-border/50 transition-colors cursor-pointer"
                title="Rolar filtros para a direita"
                aria-label="Rolar filtros para a direita"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Lista de conversas com scroll */}
      <div data-tour="atendimento-conversas" className="min-h-0 flex-1 overflow-y-auto divide-y divide-border/20">
        {carregando ? (
          <div className="space-y-3 p-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-1">
                <Skeleton className="size-11 rounded-full shrink-0" />
                <div className="flex-1 space-y-2 py-0.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : visiveis.length === 0 ? (
          <ListaVazia
            filtro={filtro}
            busca={busca}
            onLimparBusca={() => onBuscaChange("")}
            onResetFiltro={() => onFiltroChange("todas")}
            onNovaConversa={onNovaConversa}
          />
        ) : (
          visiveis.map((c) => {
            const nome = nomeDaConversa(c);
            const selecionado = selecionada === c.id;
            return (
              <button
                key={c.id}
                data-conversa-id={c.id}
                aria-label={`Abrir conversa com ${nome}`}
                type="button"
                onClick={() => onSelecionar(c.id)}
                className={`relative flex w-full gap-3 p-3 text-left transition-colors cursor-pointer ${
                  selecionado
                    ? "bg-[#F0F2F5] dark:bg-[#2A3942] border-l-4 border-l-[#00A884]"
                    : "hover:bg-[#F5F6F6] dark:hover:bg-[#202C33]"
                }`}
              >
                <div className="relative shrink-0">
                  <div
                    className={`flex size-11 items-center justify-center rounded-full text-sm font-semibold shadow-2xs ${avatarColorClass(nome)}`}
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
                  {c.clienteId ? (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-[#25D366] border-2 border-background"
                      title="Cliente Vinculado ao ERP"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`truncate text-sm ${
                        c.naoLidas > 0 ? "font-bold text-foreground" : "font-medium text-foreground/90"
                      }`}
                    >
                      {nome}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {horaDaConversa(c.ultimaMensagemEm)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground flex items-center gap-1">
                      {c.ultimaMensagemPrevia ? (
                        <span>{c.ultimaMensagemPrevia}</span>
                      ) : (
                        <span>
                          {c.contato.clienteRazaoSocial
                            ? c.contato.nomeExibicao
                            : telefoneBonito(c.contato.telefoneNormalizado) ?? "Sem mensagens gravadas"}
                        </span>
                      )}
                    </span>
                    {c.naoLidas > 0 ? (
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-[10px] font-bold text-white shadow-2xs">
                        {c.naoLidas}
                      </span>
                    ) : null}
                  </div>
                  <SinaisDoCliente conversa={c} />
                </div>
              </button>
            );
          })
        )}
      </div>

      <Dialog open={dialogImportarAberto} onOpenChange={setDialogImportarAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Importar contatos do WhatsApp</DialogTitle>
            <DialogDescription>
              Esta ação lerá os contatos da agenda do aparelho conectado e criará a conversa de cada um vinculada a esta conexão de atendimento.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-xs text-muted-foreground space-y-1">
            <p>• Contatos já existentes serão preservados e atualizados.</p>
            <p>• As fotos de perfil serão baixadas automaticamente em segundo plano.</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDialogImportarAberto(false)}
              disabled={importarMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => importarMutation.mutate()}
              disabled={importarMutation.isPending}
              className="gap-1.5 bg-[#00A884] hover:bg-[#008f6f] text-white"
            >
              {importarMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Importando contatos...
                </>
              ) : (
                <>
                  <Download className="size-4" />
                  Confirmar importação
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ListaVazia({
  filtro,
  busca,
  onLimparBusca,
  onResetFiltro,
  onNovaConversa,
}: {
  filtro: FiltroConversas;
  busca: string;
  onLimparBusca: () => void;
  onResetFiltro: () => void;
  onNovaConversa?: () => void;
}) {
  if (busca) {
    return (
      <div className="flex h-full min-h-[260px] flex-col items-center justify-center p-6 text-center select-none">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground mb-3">
          <Search className="size-6 text-muted-foreground/70" />
        </div>
        <p className="text-sm font-medium text-foreground">Nenhum resultado</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-[220px]">
          Nenhum contato encontrado para &ldquo;{busca}&rdquo;.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onLimparBusca}
          className="mt-3.5 h-8 text-xs"
        >
          Limpar busca
        </Button>
      </div>
    );
  }

  if (filtro === "nao_lidas") {
    return (
      <div className="flex h-full min-h-[260px] flex-col items-center justify-center p-6 text-center select-none">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-3">
          <CheckCircle2 className="size-6" />
        </div>
        <p className="text-sm font-semibold text-foreground">Tudo em dia!</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-[220px]">
          Nenhuma mensagem não lida no momento.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onResetFiltro}
          className="mt-3 h-8 text-xs text-[#00A884]"
        >
          Ver todas as conversas
        </Button>
      </div>
    );
  }

  if (filtro === "sem_vinculo") {
    return (
      <div className="flex h-full min-h-[260px] flex-col items-center justify-center p-6 text-center select-none">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3">
          <Link2 className="size-6" />
        </div>
        <p className="text-sm font-semibold text-foreground">Todos vinculados</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-[220px]">
          Todos os contatos atendidos já estão vinculados a clientes cadastrados.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onResetFiltro}
          className="mt-3 h-8 text-xs text-[#00A884]"
        >
          Ver todas as conversas
        </Button>
      </div>
    );
  }

  if (filtro === "retornos") {
    return (
      <div className="flex h-full min-h-[260px] flex-col items-center justify-center p-6 text-center select-none">
        <div className="flex size-12 items-center justify-center rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 mb-3">
          <CalendarCheck2 className="size-6" />
        </div>
        <p className="text-sm font-semibold text-foreground">Sem retornos agendados</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-[220px]">
          Nenhum contato com retorno comercial pendente nesta lista.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onResetFiltro}
          className="mt-3 h-8 text-xs text-[#00A884]"
        >
          Ver todas as conversas
        </Button>
      </div>
    );
  }

  if (filtro === "aprovacoes") {
    return (
      <div className="flex h-full min-h-[260px] flex-col items-center justify-center p-6 text-center select-none">
        <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 mb-3">
          <BriefcaseBusiness className="size-6" />
        </div>
        <p className="text-sm font-semibold text-foreground">Sem aprovações</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-[220px]">
          Nenhum orçamento aguardando aprovação nesta lista.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={onResetFiltro}
          className="mt-3 h-8 text-xs text-[#00A884]"
        >
          Ver todas as conversas
        </Button>
      </div>
    );
  }

  // Estado padrão: Nenhuma conversa ainda
  return (
    <div className="flex h-full min-h-[260px] flex-col items-center justify-center p-6 text-center select-none">
      <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10 text-[#00A884] mb-3">
        <MessageCircle className="size-6" />
      </div>
      <p className="text-sm font-semibold text-foreground">Nenhuma conversa ainda</p>
      <p className="mt-1 text-xs text-muted-foreground max-w-[230px] leading-relaxed">
        Elas aparecerão aqui assim que um cliente escrever ou ao iniciar um atendimento.
      </p>
      {onNovaConversa ? (
        <Button
          size="sm"
          onClick={onNovaConversa}
          className="mt-4 h-8 gap-1.5 text-xs font-medium bg-[#00A884] hover:bg-[#008f6f] text-white shadow-xs"
        >
          <MessageSquarePlus className="size-3.5" />
          Nova conversa
        </Button>
      ) : null}
    </div>
  );
}

function horaDaConversa(valor: string | null) {
  if (!valor) return "";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  const hoje = new Date();
  if (data.toDateString() === hoje.toDateString()) {
    return data.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function SinaisDoCliente({ conversa }: { conversa: WhatsappConversa }) {
  const {
    diasSemComprar,
    situacaoTitulos,
    outrosAtendentes,
    proximoRetornoEm,
    orcamentoAguardandoAprovacao,
  } = conversa;
  if (
    diasSemComprar == null &&
    situacaoTitulos == null &&
    outrosAtendentes.length === 0 &&
    !proximoRetornoEm &&
    !orcamentoAguardandoAprovacao
  ) {
    return null;
  }

  const corTitulos =
    situacaoTitulos === "vencido"
      ? "text-destructive"
      : situacaoTitulos === "vencendo"
        ? "text-sky-600 dark:text-sky-400"
        : "text-emerald-600 dark:text-emerald-400";
  const tituloTitulos =
    situacaoTitulos === "vencido"
      ? "Tem título vencido"
      : situacaoTitulos === "vencendo"
        ? "Título vencendo nos próximos 7 dias"
        : "Títulos em dia";

  return (
    <div className="flex items-center gap-2 text-xs pt-0.5">
      {diasSemComprar != null ? (
        <span
          className="flex items-center gap-1 text-muted-foreground text-[11px]"
          title={
            diasSemComprar === 0
              ? "Comprou hoje"
              : `Última compra há ${diasSemComprar} dia(s)`
          }
        >
          <ShoppingCart className="size-3" />
          {diasSemComprar}d
        </span>
      ) : null}

      {situacaoTitulos ? (
        <span className={corTitulos} title={tituloTitulos}>
          <DollarSign className="size-3" />
        </span>
      ) : null}

      {outrosAtendentes.length > 0 ? (
        <span
          className="flex items-center gap-1 text-amber-600 dark:text-amber-400 text-[11px]"
          title={`Este contato também é atendido por: ${outrosAtendentes.join(", ")}`}
        >
          <Users className="size-3" />
          {outrosAtendentes.length}
        </span>
      ) : null}

      {proximoRetornoEm ? (
        <span className="rounded-full bg-sky-500/10 px-1.5 py-0.2 text-[10px] text-sky-700 dark:text-sky-300 font-medium">
          Retorno {new Date(proximoRetornoEm).toLocaleDateString("pt-BR")}
        </span>
      ) : null}

      {orcamentoAguardandoAprovacao ? (
        <span className="rounded-full bg-amber-500/10 px-1.5 py-0.2 text-[10px] text-amber-700 dark:text-amber-300 font-medium">
          Aprovação
        </span>
      ) : null}
    </div>
  );
}


/**
 * Mesma linha telefônica? Compara **DDD + os 8 últimos dígitos** e ignora o
 * nono dígito, que é justamente o que diverge: número antigo fica no WhatsApp
 * sem o 9 (`67 9146-8448`) e no cadastro com ele (`67 99146-8448`). A versão
 * anterior comparava sufixo dos dígitos e acusava divergência nesse caso.
 *
 * O DDD só entra quando os dois lados o têm — cadastro sem DDD (`991468448`)
 * compara só os 8 finais. Nunca sufixo solto: dois DDDs com o mesmo final são
 * linhas diferentes.
 */
function telefoneEquivalente(a: string | null, b: string) {
  const partes = (valor: string) => {
    const digitos = valor.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
    if (digitos.length < 8) return null;
    return {
      ddd: digitos.length >= 10 ? digitos.slice(0, 2) : null,
      linha: digitos.slice(-8),
    };
  };
  const primeiro = a ? partes(a) : null;
  const segundo = partes(b);
  if (!primeiro || !segundo) return false;
  if (primeiro.linha !== segundo.linha) return false;
  return !primeiro.ddd || !segundo.ddd || primeiro.ddd === segundo.ddd;
}

function tituloDoPainel(modo: "contato" | "posicao" | "orcamento") {
  if (modo === "posicao") return "Posição do cliente";
  if (modo === "orcamento") return "Novo orçamento";
  return "Dados do contato";
}

function ConteudoFerramenta({
  clienteId,
  modo,
  onFechar,
}: {
  clienteId: string;
  modo: "posicao" | "orcamento";
  onFechar: () => void;
}) {
  return (
    <div className="min-w-0 p-4">
      {modo === "posicao" ? (
        <PosicaoClienteConteudo
          clienteId={clienteId}
          mostrarVoltar={false}
          compacto
        />
      ) : (
        <OrcamentoFormContent
          key={clienteId}
          clienteIdPadrao={clienteId}
          onClose={onFechar}
        />
      )}
    </div>
  );
}

/**
 * Dados do contato — a coluna da direita, no formato que o WhatsApp
 * consagrou: avatar, nome e número no topo, e abaixo o que **a plataforma**
 * sabe e o WhatsApp não: qual cliente é, há quanto tempo não compra, como
 * está a cobrança e quem mais o atende.
 */
function PainelCliente({
  conversa,
  emCortina = false,
}: {
  conversa: WhatsappConversa | null;
  emCortina?: boolean;
}) {
  // Trocar o vínculo é raro e tem consequência (muda de quem é a conversa
  // daqui em diante), então fica atrás de um lápis em vez de ocupar o painel.
  const [trocandoVinculo, setTrocandoVinculo] = useState(false);
  const [removendoVinculo, setRemovendoVinculo] = useState(false);
  const queryClient = useQueryClient();
  const empresaId = useAuthStore((s) => s.user?.empresaAtivaId);
  // Vincular/trocar/remover é `editar` — o mesmo que a API exige.
  const podeEditar = useAuthStore(
    (s) => s.user?.permissoes.includes("whatsapp-conversas.editar") ?? false,
  );
  const fotoTentadaRef = useRef<string | null>(null);

  const atualizarFotoMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: boolean; fotoUrl: string | null; mensagem?: string }>(
        `/whatsapp/conversas/${id}/foto`,
        { method: "POST" },
      ),
    onSuccess: (res) => {
      if (res.ok && res.fotoUrl) {
        toast.success("Foto de perfil atualizada com sucesso!");
        void queryClient.invalidateQueries({
          queryKey: ["whatsapp-conversas"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["whatsapp-conversa", empresaId, conversa?.id],
        });
      } else {
        toast.info(res.mensagem ?? "Foto não disponível no WhatsApp.");
      }
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Não foi possível buscar a foto de perfil.",
      );
    },
  });

  useEffect(() => {
    if (conversa && !conversa.contato.fotoUrl && fotoTentadaRef.current !== conversa.id) {
      fotoTentadaRef.current = conversa.id;
      apiFetch<{ ok: boolean; fotoUrl: string | null }>(
        `/whatsapp/conversas/${conversa.id}/foto`,
        { method: "POST" },
      )
        .then((res) => {
          if (res.ok && res.fotoUrl) {
            void queryClient.invalidateQueries({
              queryKey: ["whatsapp-conversas"],
            });
            void queryClient.invalidateQueries({
              queryKey: ["whatsapp-conversa", empresaId, conversa.id],
            });
          }
        })
        .catch(() => {});
    }
  }, [conversa, empresaId, queryClient]);

  if (!conversa) {
    return emCortina ? (
      <p className="p-6 text-sm text-muted-foreground">
        Selecione uma conversa para consultar o contato.
      </p>
    ) : (
      <div className="hidden h-full w-full xl:block" />
    );
  }

  const nome =
    conversa.contato.nomeExibicao ??
    conversa.contato.clienteRazaoSocial ??
    conversa.contato.telefoneNormalizado ??
    "Contato";
  const telefone = telefoneBonito(conversa.contato.telefoneNormalizado);
  // O ERP pode repetir o mesmo número em telefone e celular. A API já
  // normaliza a lista, mas a tela também se protege para dados antigos em cache.
  const telefonesCliente = [...new Set(conversa.contato.clienteTelefones)];
  const telefoneDivergente =
    telefonesCliente.length > 0 &&
    !telefonesCliente.some((cadastrado) =>
      telefoneEquivalente(conversa.contato.telefoneNormalizado, cadastrado),
    );

  return (
    <div
      className={`h-full w-full space-y-4 overflow-y-auto bg-background p-4 text-sm ${
        emCortina ? "block" : "hidden border-l xl:block"
      }`}
    >
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <div
          className={`relative flex size-20 items-center justify-center rounded-full text-2xl font-medium overflow-hidden shadow-xs ${avatarColorClass(nome)}`}
        >
          {conversa.contato.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assetUrl(conversa.contato.fotoUrl) ?? undefined}
              alt={nome}
              className="size-full rounded-full object-cover"
            />
          ) : (
            initials(nome)
          )}
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <p className="font-semibold text-base text-foreground">{nome}</p>
          {telefone ? (
            <p className="text-xs text-muted-foreground">
              WhatsApp da conversa · {telefone}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => atualizarFotoMutation.mutate(conversa.id)}
            disabled={atualizarFotoMutation.isPending}
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            title="Buscar foto de perfil atualizada no WhatsApp"
          >
            <Camera
              className={`size-3 ${atualizarFotoMutation.isPending ? "animate-spin" : ""}`}
            />
            {atualizarFotoMutation.isPending ? "Buscando..." : "Atualizar foto"}
          </button>
        </div>
      </div>

      {conversa.contato.clienteRazaoSocial ? (
        <>
          <div className="border-t pt-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Cliente</p>
                <p className="font-medium">
                  {conversa.contato.clienteRazaoSocial}
                </p>
                <p className="text-xs text-muted-foreground">
                  Código {conversa.contato.clienteCodigoErp ?? "—"}
                </p>
              </div>
              {/* Duas ações distintas e visíveis: trocar por outro cliente e
                  remover o vínculo. Remover estava só dentro da troca, e
                  quem queria desvincular não achava. Só com `editar`. */}
              <div className={`${podeEditar ? "flex" : "hidden"} shrink-0 items-center gap-1`}>
                <button
                  type="button"
                  title="Trocar cliente vinculado"
                  onClick={() => setTrocandoVinculo((v) => !v)}
                  className="text-muted-foreground transition hover:text-foreground"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  title="Remover vínculo com o cliente"
                  onClick={() => setRemovendoVinculo(true)}
                  className="text-muted-foreground transition hover:text-destructive"
                >
                  <Unlink className="size-4" />
                </button>
              </div>
            </div>
            {trocandoVinculo ? (
              <div className="pt-2">
                <VincularCliente
                  conversa={conversa}
                  aoConcluir={() => setTrocandoVinculo(false)}
                />
              </div>
            ) : null}
          </div>

          {telefonesCliente.length > 0 ? (
            <div className="space-y-1 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                Telefones cadastrados no cliente
              </p>
              {telefonesCliente.map((cadastrado) => (
                <p key={cadastrado}>{telefoneBonito(cadastrado) ?? cadastrado}</p>
              ))}
              {telefoneDivergente ? (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                  O WhatsApp desta conversa não coincide com os telefones cadastrados.
                  Confirme o cliente antes de enviar documentos financeiros.
                </p>
              ) : null}
            </div>
          ) : null}

          {conversa.diasSemComprar != null || conversa.situacaoTitulos ? (
            <div className="space-y-1 border-t pt-3">
              {conversa.diasSemComprar != null ? (
                <p className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Última compra
                  </span>
                  <span>
                    {conversa.diasSemComprar === 0
                      ? "hoje"
                      : `há ${conversa.diasSemComprar} dias`}
                  </span>
                </p>
              ) : null}
              {conversa.situacaoTitulos ? (
                <p className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Títulos</span>
                  <span
                    className={
                      conversa.situacaoTitulos === "vencido"
                        ? "text-destructive"
                        : conversa.situacaoTitulos === "vencendo"
                          ? "text-sky-600 dark:text-sky-400"
                          : "text-emerald-600 dark:text-emerald-400"
                    }
                  >
                    {conversa.situacaoTitulos === "vencido"
                      ? "vencido"
                      : conversa.situacaoTitulos === "vencendo"
                        ? "vence em 7 dias"
                        : "em dia"}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : podeEditar ? (
        <div className="border-t pt-3">
          <VincularCliente conversa={conversa} />
        </div>
      ) : null}

      {conversa.outrosAtendentes.length > 0 ? (
        // Aviso, não detalhe: a conversa do outro vendedor continua invisível
        // para quem não tem escopo sobre ela.
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          <p className="font-medium">Também atendido por</p>
          <p className="text-muted-foreground">
            {conversa.outrosAtendentes.join(", ")}
          </p>
        </div>
      ) : null}

      <div className="space-y-2 border-t pt-3">
        <div>
          <p className="text-xs text-muted-foreground">Responsável pelo atendimento</p>
          <p>{conversa.vendedorNome}</p>
        </div>
        {/* Por qual número a conversa entrou — e por onde a resposta sai.
            Importa para o supervisor, que pode estar olhando a conexão de
            outro vendedor. */}
        {conversa.sessaoNumero ? (
          <div>
            <p className="text-xs text-muted-foreground">Conexão de envio</p>
            <p className="flex items-center gap-1 text-xs">
              <Plug className="size-3 shrink-0 text-muted-foreground" />
              {telefoneBonito(conversa.sessaoNumero)}
            </p>
          </div>
        ) : null}
      </div>

      <RemoverVinculoDialog
        conversa={conversa}
        aberto={removendoVinculo}
        onOpenChange={setRemovendoVinculo}
      />
    </div>
  );
}

/**
 * Confirmação para remover o vínculo com o cliente.
 *
 * Pede confirmação porque a consequência não é óbvia na hora: sem vínculo, a
 * plataforma **para de gravar** o que for dito daqui em diante (regra de
 * privacidade do módulo) e as ações do sistema somem da conversa. O que já
 * está gravado permanece — desvincular não apaga histórico.
 */
function RemoverVinculoDialog({
  conversa,
  aberto,
  onOpenChange,
}: {
  conversa: WhatsappConversa;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const remover = useMutation({
    mutationFn: () =>
      apiFetch(`/whatsapp/conversas/${conversa.id}/vinculo`, {
        method: "PUT",
        body: { clienteId: null, ignorar: false },
      }),
    onSuccess: async () => {
      toast.success("Vínculo removido — as próximas mensagens não serão gravadas");
      onOpenChange(false);
      // Espera os dados novos: sem cliente, os indicadores do contato somem, e
      // deixá-los na tela diria que a conversa ainda está vinculada.
      await queryClient.refetchQueries({ queryKey: ["whatsapp-conversas"] });
      void queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao remover o vínculo"),
  });

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remover o vínculo com o cliente?</DialogTitle>
          <DialogDescription>
            A conversa deixa de ser ligada a{" "}
            <strong>{conversa.contato.clienteRazaoSocial}</strong>. As mensagens
            já gravadas continuam no histórico, mas as próximas{" "}
            <strong>não serão gravadas</strong> e as ações do sistema saem da
            conversa. Dá para vincular de novo depois.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={remover.isPending}
            onClick={() => remover.mutate()}
          >
            {remover.isPending ? "Removendo…" : "Remover vínculo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Vínculo do contato com um cliente da carteira.
 *
 * É o que **autoriza a gravação**: sem cliente vinculado, o que o contato
 * escreve não é guardado (a conversa aparece na lista, o conteúdo não fica) e
 * as ações do sistema não têm com quem trabalhar. Até aqui a rota existia
 * (`PUT /whatsapp/conversas/:id/vinculo`), mas nenhuma tela a chamava: só dava
 * para vincular ao **iniciar** a conversa por um cliente, e conversa que chegou
 * pelo aparelho ficava sem saída.
 *
 * Gravação retroativa não acontece: o que passou antes do vínculo não volta —
 * daí o aviso na tela, para o vendedor não esperar o histórico aparecer.
 */
// Sentinelas do seletor de pessoa: Radix não aceita item com valor vazio.
const SEM_CONTATO = "__sem__";
const NOVO_CONTATO = "__novo__";

function VincularCliente({
  conversa,
  aoConcluir,
}: {
  conversa: WhatsappConversa;
  /** Fecha a edição quando o vínculo já existia e foi trocado. */
  aoConcluir?: () => void;
}) {
  const queryClient = useQueryClient();
  const [clienteId, setClienteId] = useState<string | null>(
    conversa.clienteId ?? null,
  );
  const [tipo, setTipo] = useState(conversa.contato.tipo ?? "geral");
  const [nome, setNome] = useState(conversa.contato.nomeExibicao ?? "");
  const [email, setEmail] = useState(conversa.contato.email ?? "");
  // `""` é "nenhum contato do cadastro" e `NOVO_CONTATO` abre o cadastro na
  // hora — o vendedor está com a pessoa do outro lado, não vai sair da tela
  // para cadastrá-la em outro lugar.
  const [contatoId, setContatoId] = useState<string>(
    conversa.contato.clienteContatoId ?? "",
  );
  const jaVinculado = Boolean(conversa.clienteId);

  // Os contatos são do cliente escolhido agora, não do vinculado antes: trocar
  // o cliente troca a lista de pessoas.
  const contatos = useQuery({
    queryKey: ["cliente-contatos", clienteId],
    queryFn: () => apiFetch<ClienteContato[]>(`/clientes/${clienteId}/contatos`),
    enabled: Boolean(clienteId),
  });

  // Trocar o cliente troca a lista de pessoas, então a escolha anterior não
  // vale mais. Ajuste durante a renderização (e não em efeito): o seletor já
  // aparece com o valor certo, sem um quadro mostrando a pessoa do cliente que
  // saiu.
  const [clienteAnterior, setClienteAnterior] = useState(clienteId);
  if (clienteId !== clienteAnterior) {
    setClienteAnterior(clienteId);
    setContatoId(
      clienteId === conversa.clienteId
        ? (conversa.contato.clienteContatoId ?? "")
        : "",
    );
  }

  const contatoEscolhido = contatos.data?.find((c) => c.id === contatoId);
  const cadastrando = contatoId === NOVO_CONTATO;

  const vincular = useMutation({
    mutationFn: async (destino: string | null) => {
      let pessoaId = contatoId === NOVO_CONTATO ? null : contatoId || null;
      if (destino && cadastrando) {
        // Cadastra a pessoa antes de vincular: é o cadastro do cliente que
        // passa a valer, e o número atendido entra nele como celular.
        const criado = await apiFetch<ClienteContato>(
          `/clientes/${destino}/contatos`,
          {
            method: "POST",
            body: {
              nome: nome.trim(),
              email: email.trim(),
              celular: conversa.contato.telefoneNormalizado ?? null,
              principal: false,
            },
          },
        );
        pessoaId = criado.id;
      }
      return apiFetch(`/whatsapp/conversas/${conversa.id}/vinculo`, {
        method: "PUT",
        body: {
          clienteId: destino,
          clienteContatoId: destino ? pessoaId : null,
          ignorar: false,
          tipo,
          nome: nome.trim() || null,
          email: email.trim() || null,
        },
      });
    },
    onSuccess: async (_dados, destino) => {
      toast.success(
        destino
          ? "Contato vinculado — as próximas mensagens ficam gravadas"
          : "Vínculo desfeito — as próximas mensagens não serão gravadas",
      );
      // `refetch` e não `invalidate`: os indicadores do contato (positivação,
      // cobrança) e o painel inteiro saem da lista de conversas, e invalidar
      // sem esperar deixaria os números do cliente **anterior** na tela até o
      // próximo ciclo de 15 s.
      await queryClient.refetchQueries({ queryKey: ["whatsapp-conversas"] });
      // A posição em cache é a do cliente que saiu.
      void queryClient.invalidateQueries({ queryKey: ["clientes"] });
      void queryClient.invalidateQueries({ queryKey: ["cliente-contatos"] });
      aoConcluir?.();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao vincular"),
  });

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <div>
        <p className="text-xs font-medium">
          {jaVinculado ? "Trocar o cliente vinculado" : "Sem cliente vinculado"}
        </p>
        <p className="text-xs text-muted-foreground">
          {jaVinculado
            ? "A troca vale daqui em diante: as mensagens já gravadas continuam onde estão."
            : "As mensagens deste contato ficam gravadas, mas as ações do sistema (títulos, boleto, notas, orçamento) só ficam disponíveis depois de vincular a um cliente."}
        </p>
      </div>

      {/* Só a carteira do vendedor desta conversa: é a mesma regra que o
          servidor aplica, e oferecer na busca o que a rota vai recusar seria
          convidar ao erro. */}
      <ClienteCombobox
        value={clienteId}
        onChange={setClienteId}
        vendedorId={conversa.vendedorId}
      />

      {/* A pessoa. Enquanto não houver cliente não há cadastro onde procurá-la,
          por isso o campo só aparece depois da escolha do cliente. */}
      {clienteId ? (
        <Select
          value={contatoId || SEM_CONTATO}
          onValueChange={(value) =>
            setContatoId(value === SEM_CONTATO ? "" : value)
          }
        >
          <SelectTrigger aria-label="Pessoa que atende neste número">
            <SelectValue placeholder="Quem atende neste número" />
          </SelectTrigger>
          <SelectContent>
            {contatos.data?.map((contato) => (
              <SelectItem key={contato.id} value={contato.id}>
                {contato.nome}
                {contato.temAcessoPortal ? " · acessa o portal" : ""}
              </SelectItem>
            ))}
            <SelectItem value={NOVO_CONTATO}>Cadastrar esta pessoa…</SelectItem>
            <SelectItem value={SEM_CONTATO}>Sem contato do cadastro</SelectItem>
          </SelectContent>
        </Select>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {contatoEscolhido ? null : (
          <Input
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            placeholder={cadastrando ? "Nome da pessoa" : "Nome do contato"}
            aria-label="Nome do contato"
          />
        )}
        <Select value={tipo} onValueChange={(value) => setTipo(value as typeof tipo)}>
          <SelectTrigger aria-label="Tipo do contato">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="geral">Geral</SelectItem>
            <SelectItem value="financeiro">Financeiro</SelectItem>
            <SelectItem value="compras">Compras</SelectItem>
            <SelectItem value="contabilidade_fiscal">Contabilidade/Fiscal</SelectItem>
            <SelectItem value="outros">Outros</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {contatoEscolhido ? (
        <p className="text-xs text-muted-foreground">
          Nome e e-mail vêm do cadastro ({contatoEscolhido.email}).
          {contatoEscolhido.temAcessoPortal
            ? " Esta pessoa já entra no Portal do Cliente."
            : ""}
        </p>
      ) : (
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={cadastrando ? "E-mail da pessoa" : "E-mail do contato"}
          aria-label="E-mail do contato"
        />
      )}
      {cadastrando ? (
        <p className="text-xs text-muted-foreground">
          A pessoa entra no cadastro do cliente com este número como celular — é
          o mesmo contato que o Portal do Cliente usa.
        </p>
      ) : null}

      <Button
        size="sm"
        className="w-full"
        disabled={
          !clienteId ||
          vincular.isPending ||
          // Cadastrar a pessoa exige nome e e-mail: é o cadastro do cliente que
          // está sendo alimentado, não uma anotação da conversa.
          (cadastrando && (nome.trim().length < 2 || !email.trim()))
        }
        onClick={() => vincular.mutate(clienteId)}
      >
        <Link2 className="size-4" />
        {vincular.isPending
          ? "Salvando…"
          : jaVinculado
            ? "Trocar vínculo"
            : "Vincular ao cliente"}
      </Button>

      {jaVinculado ? (
        <Button
          size="sm"
          variant="ghost"
          className="w-full text-muted-foreground"
          disabled={vincular.isPending}
          onClick={() => vincular.mutate(null)}
        >
          Desfazer vínculo
        </Button>
      ) : null}
    </div>
  );
}
