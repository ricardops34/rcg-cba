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
  ArrowLeft,
  BriefcaseBusiness,
  CalendarCheck2,
  DollarSign,
  Link2,
  MessageCircle,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plug,
  ShoppingCart,
  UserRound,
  Unlink,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  WhatsappConversa,
  WhatsappEventoAtendimento,
  WhatsappMensagem,
  WhatsappSessao,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { avatarColorClass, initials } from "@/lib/avatar-color";
import { ClienteCombobox } from "@/components/crud/cliente-combobox";
import { OrcamentoFormContent } from "@/components/crud/orcamento-form";
import { PosicaoClienteConteudo } from "@/components/comercial/posicao-cliente-conteudo";
import { ColunaRedimensionavel } from "@/components/ui/coluna-redimensionavel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConexaoSheet } from "@/components/whatsapp/conexao-sheet";
import { NovaConversaDialog } from "@/components/whatsapp/nova-conversa-dialog";
import { Composer } from "@/components/whatsapp/composer";
import { MensagemBolha } from "@/components/whatsapp/mensagem-bolha";
import { AcoesCliente } from "@/components/whatsapp/acoes-cliente";

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
const PREF_PAINEL = "atendimento-painel-aberto";

/** Quem redesenha quando uma preferência muda (o localStorage não avisa). */
const ouvintesDePreferencia = new Set<() => void>();

/**
 * Painel aberto ou fechado, lembrado no `localStorage`.
 *
 * `useSyncExternalStore` em vez de `useState` + `useEffect`: o
 * `localStorage` não existe no servidor, e ler dele depois da montagem para
 * então chamar `setState` provoca uma segunda renderização a cada carga da
 * tela. Aqui o servidor recebe o valor padrão (o terceiro argumento) e o
 * cliente lê o valor real na primeira renderização, sem repique.
 */
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
 * Atendimento por WhatsApp — três colunas: conversas, mensagens e o cliente.
 * A conexão do aparelho é um botão daqui, não uma tela à parte.
 *
 * As duas laterais recolhem: numa tela de 14" o rolo da conversa fica estreito
 * demais com as três colunas fixas, e quem já escolheu a conversa não precisa
 * da lista à vista. A escolha fica no `localStorage` porque é preferência de
 * quem usa, não estado da tela — reabrir a página com tudo aberto de novo
 * anularia o ajuste.
 */
export default function AtendimentoPage() {
  const podeAcompanharEquipe = useAuthStore(
    (state) =>
      state.user?.permissoes.includes("whatsapp-equipe.visualizar") ?? false,
  );
  const [conexaoAberta, setConexaoAberta] = useState(false);
  const [novaConversaAberta, setNovaConversaAberta] = useState(false);
  // A conversa aberta mora na URL (`?conversa=<id>`), não em estado local: é
  // o que faz o link do sino de notificações abrir a conversa certa mesmo
  // para quem já está nesta tela — sem remontar o componente, um estado
  // interno ficaria na conversa anterior. `replace` e não `push` porque
  // trocar de conversa não é navegar: encheria o histórico do navegador.
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
  /**
   * Conexão que a lista mostra, pelo `vendedorId` (dono da conexão). `null` =
   * a do próprio usuário, que é como a tela abre.
   *
   * Trocar para a de um colega é **consulta**: o servidor deixa supervisor e
   * gerente lerem as conversas do time, mas quem responde é o dono do aparelho
   * (`garantirDono`, na API). A tela avisa isso em vez de deixar digitar para
   * tomar erro no envio.
   */
  const [conexaoEscolhida, setConexaoEscolhida] = useState<string | null>(null);
  const [listaPreferida, alternarPreferenciaLista] = usePainelAberto(PREF_LISTA);
  const [painelAberto, alternarPainel] = usePainelAberto(PREF_PAINEL);

  // Quem chega com a conversa já escolhida na URL — o "Atendimento" do menu da
  // Posição de Cliente, o link do sino — não precisa da lista de contatos à
  // vista: já sabe com quem vai falar, e a conversa começa ocupando a tela.
  //
  // Vale só para ESTA entrada, e por isso não grava no `localStorage`: a
  // preferência de quem abre a tela pelo menu continua valendo. Só a primeira
  // renderização conta (`useState` com inicializador), senão trocar de conversa
  // pela lista tornaria a recolher.
  const [ignorandoPreferencia, setIgnorandoPreferencia] = useState(
    () => !!conversaId,
  );
  const listaAberta = listaPreferida && !ignorandoPreferencia;
  const alternarLista = () => {
    if (ignorandoPreferencia) {
      setIgnorandoPreferencia(false);
      // A preferência guardada era "fechada": abrir agora precisa mudá-la, ou
      // o clique não faria nada visível.
      if (!listaPreferida) alternarPreferenciaLista();
      return;
    }
    alternarPreferenciaLista();
  };
  // O que a coluna da direita mostra. Posição e orçamento entram no lugar dos
  // dados do contato e voltam ao fechar — um espaço só, como o "Dados do
  // contato" do WhatsApp, que empurra a conversa em vez de cobri-la.
  const [painelDireito, setPainelDireito] = useState<
    "contato" | "posicao" | "orcamento"
  >("contato");
  const [painelMovelAberto, setPainelMovelAberto] = useState(false);

  const abrirPainel = useCallback(
    (modo: "contato" | "posicao" | "orcamento") => {
      setPainelDireito(modo);
      if (window.innerWidth < 1280) {
        setPainelMovelAberto(true);
        return;
      }

      // O usuário pode ter recolhido a coluna direita anteriormente. O atalho
      // precisa abrir a ferramenta, não apenas trocar um conteúdo invisível.
      if (!painelAberto) alternarPainel();
    },
    [painelAberto, alternarPainel],
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
    queryKey: ["whatsapp-sessao"],
    queryFn: () => apiFetch<WhatsappSessao | null>("/whatsapp/sessao"),
    // Erros 4xx são condições de cadastro/permissão e não melhoram repetindo.
    retry: false,
    // Enquanto pareia, o status muda por fora (o celular lê o QR).
    refetchInterval: (q) =>
      q.state.data?.status === "pareando" ? 3000 : false,
  });

  /**
   * As conexões que este usuário alcança. O servidor já as limita
   * (`escopoLeituraWhatsapp`): o vendedor recebe só a própria, e quem tem
   * `whatsapp-equipe.visualizar` — supervisor e gerente — recebe as do seu
   * time. Por isso o seletor abaixo só existe para eles: para o vendedor a
   * lista tem uma opção, e um select de uma opção é ruído.
   */
  const { data: conexoes = [] } = useQuery({
    queryKey: ["whatsapp-sessoes"],
    queryFn: () => apiFetch<WhatsappSessao[]>("/whatsapp/sessoes"),
    enabled: podeAcompanharEquipe,
  });
  const podeTrocarConexao = podeAcompanharEquipe && conexoes.length > 1;

  // `null` = ainda não escolheu, e aí vale a conexão do próprio usuário —
  // atendimento é conversa de um número só, e abrir com as dos colegas
  // misturadas confunde quem responde. "todas" é escolha explícita.
  const conexaoAtual = conexaoEscolhida ?? sessao?.vendedorId ?? null;

  const { data: conversas, isLoading: carregandoConversas } = useQuery({
    queryKey: ["whatsapp-conversas", busca, conexaoAtual, filtroConversas],
    queryFn: () => {
      const params = new URLSearchParams();
      if (busca) params.set("busca", busca);
      if (filtroConversas === "sem_vinculo") params.set("semVinculo", "true");
      // O servidor filtra por vendedor, dono da conexão — e continua aplicando
      // o escopo por cima: o filtro restringe, nunca amplia.
      if (conexaoAtual) params.set("vendedorId", conexaoAtual);
      const qs = params.toString();
      return apiFetch<ListaConversas>(
        `/whatsapp/conversas${qs ? `?${qs}` : ""}`,
      );
    },
    // Sem saber qual é a conexão do usuário, buscar traria a lista da equipe
    // por um instante — que é justamente o que este filtro evita.
    enabled: !!conexaoAtual,
    refetchInterval: 15000,
  });

  const conversaSelecionada =
    conversas?.itens.find((c) => c.id === conversaId) ?? null;

  if (carregandoSessao) {
    return <Skeleton className="h-96 w-full" />;
  }

  // Sem sessão, a tela explica em vez de mostrar uma lista vazia sem motivo.
  if (!sessao || sessao.status !== "conectada") {
    const mensagemSemSessao =
      erroSessao instanceof ApiError
        ? erroSessao.message
        : "Conecte o aparelho para atender seus clientes por aqui. As conversas com clientes ficam gravadas na plataforma.";
    return (
      <>
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-12 text-center">
          <MessageCircle className="size-10 text-muted-foreground" />
          <div>
            <p className="font-medium">
              {erroSessao ? "WhatsApp indisponível para este usuário" : "Seu WhatsApp não está conectado"}
            </p>
            <p className="text-sm text-muted-foreground">
              {mensagemSemSessao}
            </p>
          </div>
          {!erroSessao ? (
            <Button onClick={() => setConexaoAberta(true)}>
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
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            size="icon"
            title={listaAberta ? "Ocultar conversas" : "Mostrar conversas"}
            onClick={alternarLista}
            className="hidden md:inline-flex"
          >
            {listaAberta ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
          </Button>
          <Input
            placeholder="Buscar por contato, telefone ou cliente"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full min-w-0 flex-1 rounded-full bg-muted/40 lg:max-w-80"
          />
          {/* Só para quem alcança mais de uma conexão — supervisor e gerente.
              Uma conexão por vez, sem opção "todas": atendimento é conversa de
              um número, e a lista misturada não diz por onde responder. */}
          {podeTrocarConexao ? (
            <Select
              value={conexaoAtual ?? ""}
              onValueChange={setConexaoEscolhida}
            >
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Minha conexão" />
              </SelectTrigger>
              <SelectContent>
                {conexoes.map((c) => (
                  <SelectItem key={c.id} value={c.vendedorId}>
                    {c.vendedorId === sessao.vendedorId
                      ? "Minha conexão"
                      : c.vendedorNome}
                    {c.numero ? ` · ${telefoneBonito(c.numero)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 overflow-x-auto pb-1 lg:pb-0">
          <Button className="shrink-0" onClick={() => setNovaConversaAberta(true)}>
            <MessageSquarePlus className="size-4" />
            Nova conversa
          </Button>
          <Button className="shrink-0" variant="outline" onClick={() => setConexaoAberta(true)}>
            <Plug className="size-4" />
            {sessao.numero ?? "Conexão"}
          </Button>
          <Button
            variant="outline"
            size="icon"
            title={painelAberto ? "Ocultar dados do cliente" : "Mostrar dados do cliente"}
            onClick={alternarPainel}
            className="hidden xl:inline-flex"
          >
            {painelAberto ? (
              <PanelRightClose className="size-4" />
            ) : (
              <PanelRightOpen className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {/* As laterais recolhem para a conversa ocupar a tela — em monitor de
          14", três colunas fixas deixam o rolo estreito demais. A largura
          vira 0 em vez de a coluna sair do grid: assim a transição desliza,
          como uma cortina, em vez de a conversa pular de tamanho. */}
      {/* Altura amarrada à viewport, descontando faixa da marca, topbar,
          respiro do shell e a barra de botões acima: quem rola é o miolo de
          cada coluna, não a página. `svh` em vez de `vh` porque no celular a
          barra do navegador entra na conta de `vh` e corta o compositor. */}
      <div className="flex h-[calc(100svh-20rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-sm sm:h-[calc(100svh-17rem)] md:flex-row lg:h-[calc(100svh-14rem)]">
        {listaAberta || !conversaId ? (
          <ColunaRedimensionavel
            larguraPadrao={320}
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
            />
          </ColunaRedimensionavel>
        ) : null}

        {/* min-w-0: sem isso o conteúdo do rolo empurra a coluna e o flex
            estoura a largura da tela. */}
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
              conversaSelecionada &&
              conversaSelecionada.vendedorId !== sessao.vendedorId
                ? { vendedorNome: conversaSelecionada.vendedorNome }
                : null
            }
            onVoltarLista={() => abrirConversa(null)}
            onAbrirContato={() => abrirPainel("contato")}
            onAbrirPosicao={() => abrirPainel("posicao")}
            onAbrirOrcamento={() => abrirPainel("orcamento")}
          />
        </div>

        {/* Largura padrão por conteúdo — o formulário de orçamento não cabe na
            coluna de dados do contato — e ajustável no arraste, com cada
            painel lembrando a sua. */}
        {painelAberto ? (
          <ColunaRedimensionavel
            key={painelDireito}
            larguraPadrao={
              painelDireito === "orcamento"
                ? 820
                : painelDireito === "posicao"
                  ? 680
                  : 320
            }
            larguraMinima={
              painelDireito === "orcamento"
                ? 680
                : painelDireito === "posicao"
                  ? 560
                  : 288
            }
            chaveArmazenamento={`atendimento-largura-${painelDireito}`}
            className="hidden xl:block"
          >
            <PainelDireito
              conversa={conversaSelecionada ?? null}
              modo={painelDireito}
              onFechar={fecharFerramenta}
            />
          </ColunaRedimensionavel>
        ) : null}
      </div>

      <Sheet open={painelMovelAberto} onOpenChange={setPainelMovelAberto}>
        <SheetContent className="w-full gap-0 p-0 sm:max-w-[min(92vw,820px)] xl:hidden">
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
        </SheetContent>
      </Sheet>

      <ConexaoSheet
        aberto={conexaoAberta}
        onOpenChange={setConexaoAberta}
        sessao={sessao}
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
}: {
  carregando: boolean;
  conversas: WhatsappConversa[];
  selecionada: string | null;
  onSelecionar: (id: string) => void;
  filtro: FiltroConversas;
  onFiltroChange: (filtro: FiltroConversas) => void;
}) {
  if (carregando) return <Skeleton className="h-full w-full" />;

  const visiveis = conversas.filter((conversa) => {
    if (filtro === "nao_lidas") return conversa.naoLidas > 0;
    if (filtro === "retornos") return !!conversa.proximoRetornoEm;
    if (filtro === "aprovacoes") return conversa.orcamentoAguardandoAprovacao;
    return true;
  });

  return (
    <div className="flex h-full w-full flex-col border-r bg-muted/10">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b p-2">
        {(
          [
            ["todas", "Todas"],
            ["nao_lidas", "Não lidas"],
            ["sem_vinculo", "Sem vínculo"],
            ["retornos", "Retornos"],
            ["aprovacoes", "Aprovações"],
          ] as const
        ).map(([valor, rotulo]) => (
          <Button
            key={valor}
            type="button"
            size="sm"
            variant={filtro === valor ? "secondary" : "ghost"}
            className="h-7 rounded-full px-2.5 text-xs"
            onClick={() => onFiltroChange(valor)}
          >
            {rotulo}
          </Button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
      {visiveis.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          {filtro === "nao_lidas"
            ? "Nenhuma conversa não lida."
            : filtro === "sem_vinculo"
              ? "Nenhum contato aguardando vínculo."
              : filtro === "retornos"
                ? "Nenhum retorno pendente nesta lista."
                : filtro === "aprovacoes"
                  ? "Nenhum orçamento aguardando aprovação nesta lista."
              : "Nenhuma conversa ainda. Elas aparecem aqui quando um cliente escrever."}
        </p>
      ) : (
        visiveis.map((c) => {
          const nome = nomeDaConversa(c);
          return (
            <button
              key={c.id}
              data-conversa-id={c.id}
              aria-label={`Abrir conversa com ${nome}`}
              type="button"
              onClick={() => onSelecionar(c.id)}
              className={`relative flex w-full gap-3 border-b p-3 text-left transition hover:bg-muted/60 ${
                selecionada === c.id
                  ? "bg-primary/10 before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:bg-primary"
                  : ""
              }`}
            >
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarColorClass(nome)}`}
              >
                {initials(nome)}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{nome}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {horaDaConversa(c.ultimaMensagemEm)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {c.ultimaMensagemPrevia ??
                      (c.contato.clienteRazaoSocial
                        ? c.contato.nomeExibicao
                        : telefoneBonito(c.contato.telefoneNormalizado)) ??
                      "Sem mensagens gravadas"}
                  </span>
                  {c.naoLidas > 0 ? (
                    <Badge className="h-5 min-w-5 shrink-0 justify-center rounded-full px-1.5">
                      {c.naoLidas}
                    </Badge>
                  ) : null}
                </div>
                <SinaisDoCliente conversa={c} />
              </div>
            </button>
          );
        })
      )}
      </div>
    </div>
  );
}

function nomeDaConversa(conversa: WhatsappConversa) {
  return (
    conversa.contato.clienteRazaoSocial ??
    conversa.contato.nomeExibicao ??
    conversa.contato.telefoneNormalizado ??
    "Contato"
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

/**
 * Os sinais do cliente na linha da conversa: há quanto tempo não compra, como
 * está a cobrança e se outro vendedor também fala com este contato.
 *
 * São ícones, e não texto, porque a linha da lista tem espaço para uma frase
 * só — o nome do contato. O `title` de cada um diz o número por extenso,
 * que é o que o vendedor confere antes de agir.
 *
 * Só aparecem para contato vinculado a cliente: sem vínculo, o servidor manda
 * tudo nulo, e não há posição nem cobrança de que falar.
 */
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

  // Vermelho vencido, azul vencendo em até 7 dias, verde em dia — a mesma
  // leitura de semáforo usada no resto do sistema.
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
    <div className="flex items-center gap-2 text-xs">
      {diasSemComprar != null ? (
        <span
          className="flex items-center gap-1 text-muted-foreground"
          title={
            diasSemComprar === 0
              ? "Comprou hoje"
              : `Última compra há ${diasSemComprar} dia(s)`
          }
        >
          <ShoppingCart className="size-3.5" />
          {diasSemComprar}d
        </span>
      ) : null}

      {situacaoTitulos ? (
        <span className={corTitulos} title={tituloTitulos}>
          <DollarSign className="size-3.5" />
        </span>
      ) : null}

      {outrosAtendentes.length > 0 ? (
        <span
          className="flex items-center gap-1 text-amber-600 dark:text-amber-400"
          title={`Este contato também é atendido por: ${outrosAtendentes.join(", ")}`}
        >
          <Users className="size-3.5" />
          {outrosAtendentes.length}
        </span>
      ) : null}

      {proximoRetornoEm ? (
        <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-sky-700 dark:text-sky-300">
          Retorno {new Date(proximoRetornoEm).toLocaleDateString("pt-BR")}
        </span>
      ) : null}

      {orcamentoAguardandoAprovacao ? (
        <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
          Aprovação
        </span>
      ) : null}
    </div>
  );
}

function Conversa({
  conversaId,
  conversa,
  clienteId,
  somenteConsulta,
  onVoltarLista,
  onAbrirContato,
  onAbrirPosicao,
  onAbrirOrcamento,
}: {
  conversaId: string | null;
  conversa: WhatsappConversa | null;
  /** Null = contato sem vínculo: as ferramentas do sistema não aparecem. */
  clienteId: string | null;
  /**
   * Conversa de outra conexão — supervisor ou gerente olhando a do time.
   * Quem responde é o dono do aparelho: a API recusa o envio
   * (`garantirDono`), e aqui o campo de mensagem sai de cena em vez de deixar
   * digitar para tomar erro depois.
   */
  somenteConsulta: { vendedorNome: string } | null;
  onVoltarLista: () => void;
  onAbrirContato: () => void;
  onAbrirPosicao: () => void;
  onAbrirOrcamento: () => void;
}) {
  const queryClient = useQueryClient();
  const [respostaPendente, setRespostaPendente] = useState<{
    conversaId: string;
    mensagem: WhatsappMensagem;
  } | null>(null);
  const fimDoRolo = useRef<HTMLDivElement>(null);

  const { data: mensagens } = useQuery({
    queryKey: ["whatsapp-mensagens", conversaId],
    queryFn: () =>
      apiFetch<WhatsappMensagem[]>(`/whatsapp/conversas/${conversaId}/mensagens`),
    enabled: !!conversaId,
    refetchInterval: 8000,
  });
  const { data: eventos = [] } = useQuery({
    queryKey: ["whatsapp-eventos", conversaId],
    queryFn: () =>
      apiFetch<WhatsappEventoAtendimento[]>(
        `/whatsapp/conversas/${conversaId}/eventos`,
      ),
    enabled: !!conversaId,
    refetchInterval: 15000,
  });

  // Conversa abre no fim, como em qualquer mensageiro — e desce a cada
  // mensagem nova em vez de deixar o vendedor rolando atrás dela.
  //
  // `nearest` rola só o container do rolo. Com `end`, o navegador também
  // ajusta os ancestrais para trazer o elemento à vista, e a página inteira
  // se mexia a cada mensagem.
  useEffect(() => {
    fimDoRolo.current?.scrollIntoView({ block: "nearest" });
  }, [mensagens?.length, conversaId]);

  // Abrir a conversa é o que a marca como lida — aqui e no celular do
  // vendedor, que recebe o recibo de leitura.
  useEffect(() => {
    if (!conversaId) return;
    void apiFetch(`/whatsapp/conversas/${conversaId}/lida`, { method: "POST" })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] });
        // O sino conta as mesmas não lidas: sem isto o badge só cairia na
        // próxima passagem dele, até um minuto depois de a conversa ser lida.
        void queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
      })
      .catch(() => undefined);
  }, [conversaId, queryClient]);

  if (!conversaId) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border text-sm text-muted-foreground">
        Escolha uma conversa
      </div>
    );
  }

  const porExternoId = new Map(
    (mensagens ?? []).map((m) => [m.externoId, m] as const),
  );
  const linhaDoTempo = [
    ...(mensagens ?? []).map((item) => ({
      tipo: "mensagem" as const,
      data: item.criadaEm,
      item,
    })),
    ...eventos.map((item) => ({
      tipo: "evento" as const,
      data: item.criadaEm,
      item,
    })),
  ].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/5">
      <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onVoltarLista}
            title="Voltar para conversas"
            className="-ml-2 md:hidden"
          >
            <ArrowLeft className="size-5" />
          </Button>
          <button
            type="button"
            onClick={onAbrirContato}
            title="Abrir dados do contato"
            className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarColorClass(conversa ? nomeDaConversa(conversa) : "Contato")}`}
          >
            {initials(conversa ? nomeDaConversa(conversa) : "Contato")}
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {conversa ? nomeDaConversa(conversa) : "Contato"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              WhatsApp {telefoneBonito(conversa?.contato.telefoneNormalizado ?? null)}
              {conversa?.vendedorNome
                ? ` · Atendimento de ${conversa.vendedorNome}`
                : ""}
            </p>
          </div>
        </div>
        {clienteId ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onAbrirPosicao}>
              <UserRound className="size-4" />
              Posição
            </Button>
            <Button variant="ghost" size="sm" onClick={onAbrirOrcamento}>
              <BriefcaseBusiness className="size-4" />
              Orçamento
            </Button>
          </div>
        ) : null}
      </div>
      {/* min-h-0 é o que faz a barra de rolagem ficar aqui dentro: sem ele o
          filho de um flex não encolhe abaixo do próprio conteúdo, o rolo
          cresce com as mensagens e quem rola é a página inteira. */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/15 p-4">
        {linhaDoTempo.map((entrada) =>
          entrada.tipo === "mensagem" ? (
            <MensagemBolha
              key={`mensagem-${entrada.item.id}`}
              mensagem={entrada.item}
              autorNome={
                entrada.item.autorNome ??
                (entrada.item.direcao === "saida"
                  ? entrada.item.enviadaPorNome ?? conversa?.vendedorNome ?? "Atendente"
                  : conversa
                    ? nomeDaConversa(conversa)
                    : "Contato")
              }
              conversaId={conversaId}
              citada={
                entrada.item.respondeuA
                  ? (porExternoId.get(entrada.item.respondeuA) ?? null)
                  : null
              }
              onResponder={(mensagem) =>
                setRespostaPendente({ conversaId, mensagem })
              }
            />
          ) : (
            <EventoComercial key={`evento-${entrada.item.id}`} evento={entrada.item} />
          ),
        )}
        <div ref={fimDoRolo} />
      </div>

      {/* shrink-0: o compositor tem altura própria e não deve ser espremido
          quando o rolo cresce. */}
      {somenteConsulta ? (
        <div className="shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            Somente consulta
          </p>
          <p className="text-muted-foreground">
            Esta conversa é da conexão de {somenteConsulta.vendedorNome}. Quem
            responde é o dono do aparelho — volte para a sua conexão para
            atender.
          </p>
        </div>
      ) : (
        <div className="flex shrink-0 items-end">
          {clienteId ? (
            <div className="pb-3 pl-2">
              <AcoesCliente
                conversaId={conversaId}
                onAbrirPosicao={onAbrirPosicao}
                onAbrirOrcamento={onAbrirOrcamento}
              />
            </div>
          ) : null}
          <div className="flex-1">
            <Composer
              conversaId={conversaId}
              respondendo={
                respostaPendente?.conversaId === conversaId
                  ? respostaPendente.mensagem
                  : null
              }
              onCancelarResposta={() => setRespostaPendente(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EventoComercial({ evento }: { evento: WhatsappEventoAtendimento }) {
  const titulos: Record<string, string> = {
    orcamento: "Orçamento enviado ao cliente",
    agendamento: "Retorno adicionado à agenda",
    boleto: "Segunda via do boleto enviada",
    danfe: "DANFE enviada ao cliente",
    titulos_resumo: "Resumo financeiro enviado",
    notas_resumo: "Resumo de notas fiscais enviado",
  };
  const detalhe = evento.detalhe;
  const descricao =
    typeof detalhe?.titulo === "string"
      ? detalhe.titulo
      : typeof detalhe?.numero === "string" || typeof detalhe?.numero === "number"
        ? `Documento ${detalhe.numero}`
        : null;

  return (
    <div className="mx-auto flex w-fit max-w-[90%] items-center gap-2 rounded-full border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
      <CalendarCheck2 className="size-3.5 shrink-0 text-primary" />
      <span className="truncate">
        <span className="font-medium text-foreground">
          {titulos[evento.acao] ?? "Ação comercial registrada"}
        </span>
        {descricao ? ` · ${descricao}` : ""}
        {evento.executadaPorNome ? ` · ${evento.executadaPorNome}` : ""}
      </span>
      <time className="shrink-0 tabular-nums">
        {new Date(evento.criadaEm).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </time>
    </div>
  );
}

/** Telefone só com dígitos (é como fica gravado) no formato que se lê. */
function telefoneBonito(digitos: string | null) {
  if (!digitos) return null;
  const d = digitos.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digitos;
}

function telefoneEquivalente(a: string | null, b: string) {
  const limpar = (valor: string) => valor.replace(/\D/g, "").replace(/^55/, "");
  const primeiro = a ? limpar(a) : "";
  const segundo = limpar(b);
  if (!primeiro || !segundo) return false;
  if (primeiro === segundo) return true;
  const menor = primeiro.length < segundo.length ? primeiro : segundo;
  const maior = primeiro.length < segundo.length ? segundo : primeiro;
  return menor.length >= 8 && maior.endsWith(menor);
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
 * A coluna da direita, que troca de conteúdo sem sair do lugar.
 *
 * Posição e orçamento **encaixam** aqui em vez de abrirem por cima: assim o
 * vendedor consulta e monta a proposta lendo a conversa ao lado, que é o
 * ponto da tela existir. É o comportamento do "Dados do contato" do WhatsApp,
 * que empurra o rolo em vez de cobri-lo.
 */
function PainelDireito({
  conversa,
  modo,
  onFechar,
}: {
  conversa: WhatsappConversa | null;
  modo: "contato" | "posicao" | "orcamento";
  onFechar: () => void;
}) {
  // Sem cliente vinculado não há posição nem orçamento: cai nos dados do
  // contato, onde fica o vínculo a fazer.
  const clienteId = conversa?.clienteId ?? null;
  if (modo === "contato" || !clienteId) {
    return <PainelCliente conversa={conversa} />;
  }

  return (
    <div className="hidden h-full w-full flex-col overflow-hidden border-l bg-background xl:flex">
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
        <div>
          <p className="text-sm font-semibold">{tituloDoPainel(modo)}</p>
          <p className="text-xs text-muted-foreground">
            A conversa continua disponível ao lado
          </p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          title="Fechar"
          className="text-muted-foreground transition hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        <ConteudoFerramenta
          clienteId={clienteId}
          modo={modo}
          onFechar={onFechar}
        />
      </div>
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
          className={`flex size-20 items-center justify-center rounded-full text-2xl font-medium ${avatarColorClass(nome)}`}
        >
          {initials(nome)}
        </div>
        <div>
          <p className="font-medium">{nome}</p>
          {telefone ? (
            <p className="text-xs text-muted-foreground">
              WhatsApp da conversa · {telefone}
            </p>
          ) : null}
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
                  quem queria desvincular não achava. */}
              <div className="flex shrink-0 items-center gap-1">
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
      ) : (
        <div className="border-t pt-3">
          <VincularCliente conversa={conversa} />
        </div>
      )}

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
  const jaVinculado = Boolean(conversa.clienteId);

  const vincular = useMutation({
    mutationFn: (destino: string | null) =>
      apiFetch(`/whatsapp/conversas/${conversa.id}/vinculo`, {
        method: "PUT",
        body: {
          clienteId: destino,
          ignorar: false,
          tipo,
          nome: nome.trim() || null,
          email: email.trim() || null,
        },
      }),
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
            : "Enquanto não houver vínculo, as mensagens deste contato não são gravadas e as ações do sistema ficam indisponíveis. O que já passou não volta."}
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

      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={nome}
          onChange={(event) => setNome(event.target.value)}
          placeholder="Nome do contato"
          aria-label="Nome do contato"
        />
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
      <Input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="E-mail do contato"
        aria-label="E-mail do contato"
      />

      <Button
        size="sm"
        className="w-full"
        disabled={
          !clienteId || vincular.isPending
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
