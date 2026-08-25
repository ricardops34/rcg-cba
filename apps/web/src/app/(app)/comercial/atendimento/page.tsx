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
  Unlink,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  WhatsappConversa,
  WhatsappMensagem,
  WhatsappSessao,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
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
import { ConexaoSheet } from "@/components/whatsapp/conexao-sheet";
import { NovaConversaDialog } from "@/components/whatsapp/nova-conversa-dialog";
import { Composer } from "@/components/whatsapp/composer";
import { MensagemBolha } from "@/components/whatsapp/mensagem-bolha";
import { AcoesCliente } from "@/components/whatsapp/acoes-cliente";

type ListaConversas = {
  total: number;
  itens: WhatsappConversa[];
};

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
  // Vazio = todas as conexões que o usuário enxerga. Guarda o `vendedorId`
  // porque é o que o servidor filtra, e cada vendedor tem uma conexão só.
  const [conexaoFiltrada, setConexaoFiltrada] = useState("");
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
  const { data: sessao, isLoading: carregandoSessao } = useQuery({
    queryKey: ["whatsapp-sessao"],
    queryFn: () => apiFetch<WhatsappSessao | null>("/whatsapp/sessao"),
    // Enquanto pareia, o status muda por fora (o celular lê o QR).
    refetchInterval: (q) =>
      q.state.data?.status === "pareando" ? 3000 : false,
  });

  /**
   * As conexões que este usuário enxerga — a própria e, para quem lê as da
   * equipe, as dos vendedores no seu escopo. Uma conexão por vendedor, então
   * esta lista é também a lista de atendentes.
   */
  const { data: conexoes = [] } = useQuery({
    queryKey: ["whatsapp-sessoes"],
    queryFn: () => apiFetch<WhatsappSessao[]>("/whatsapp/sessoes"),
  });
  const variasConexoes = conexoes.length > 1;

  const { data: conversas, isLoading: carregandoConversas } = useQuery({
    queryKey: ["whatsapp-conversas", busca, conexaoFiltrada],
    queryFn: () => {
      const params = new URLSearchParams();
      if (busca) params.set("busca", busca);
      // O servidor filtra por vendedor, que é o dono da conexão — e continua
      // aplicando o escopo por cima: o filtro restringe, nunca amplia.
      if (conexaoFiltrada) params.set("vendedorId", conexaoFiltrada);
      const qs = params.toString();
      return apiFetch<ListaConversas>(
        `/whatsapp/conversas${qs ? `?${qs}` : ""}`,
      );
    },
    refetchInterval: 15000,
  });

  const conversaSelecionada =
    conversas?.itens.find((c) => c.id === conversaId) ?? null;

  if (carregandoSessao) {
    return <Skeleton className="h-96 w-full" />;
  }

  // Sem sessão, a tela explica em vez de mostrar uma lista vazia sem motivo.
  if (!sessao || sessao.status !== "conectada") {
    return (
      <>
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-12 text-center">
          <MessageCircle className="size-10 text-muted-foreground" />
          <div>
            <p className="font-medium">Seu WhatsApp não está conectado</p>
            <p className="text-sm text-muted-foreground">
              Conecte o aparelho para atender seus clientes por aqui. As
              conversas com clientes ficam gravadas na plataforma.
            </p>
          </div>
          <Button onClick={() => setConexaoAberta(true)}>
            <Plug className="size-4" />
            Conectar WhatsApp
          </Button>
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
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
            className="max-w-80"
          />
          {/* Só com mais de uma conexão à vista: para o vendedor, que tem a
              própria e mais nada, o seletor teria uma opção só. */}
          {variasConexoes ? (
            <Select
              value={conexaoFiltrada || "todas"}
              onValueChange={(v) => setConexaoFiltrada(v === "todas" ? "" : v)}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Todas as conexões" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as conexões</SelectItem>
                {conexoes.map((c) => (
                  <SelectItem key={c.id} value={c.vendedorId}>
                    {c.vendedorNome}
                    {c.numero ? ` · ${telefoneBonito(c.numero)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setNovaConversaAberta(true)}>
            <MessageSquarePlus className="size-4" />
            Nova conversa
          </Button>
          <Button variant="outline" onClick={() => setConexaoAberta(true)}>
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
      <div className="flex h-[calc(100svh-14rem)] flex-col gap-3 overflow-hidden md:flex-row">
        {listaAberta ? (
          <ColunaRedimensionavel
            larguraPadrao={320}
            chaveArmazenamento="atendimento-largura-lista"
            lado="esquerda"
            className="hidden md:block"
          >
            <ListaDeConversas
              carregando={carregandoConversas}
              conversas={conversas?.itens ?? []}
              selecionada={conversaId}
              onSelecionar={abrirConversa}
              mostrarConexao={variasConexoes}
            />
          </ColunaRedimensionavel>
        ) : null}

        {/* min-w-0: sem isso o conteúdo do rolo empurra a coluna e o flex
            estoura a largura da tela. */}
        <div className="h-full min-h-0 min-w-0 flex-1">
          <Conversa
            conversaId={conversaId}
            clienteId={conversaSelecionada?.clienteId ?? null}
            onAbrirPosicao={() => setPainelDireito("posicao")}
            onAbrirOrcamento={() => setPainelDireito("orcamento")}
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
                ? 736
                : painelDireito === "posicao"
                  ? 384
                  : 288
            }
            chaveArmazenamento={`atendimento-largura-${painelDireito}`}
            className="hidden xl:block"
          >
            <PainelDireito
              conversa={conversaSelecionada ?? null}
              modo={painelDireito}
              onFechar={() => setPainelDireito("contato")}
            />
          </ColunaRedimensionavel>
        ) : null}
      </div>

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
  mostrarConexao,
}: {
  carregando: boolean;
  conversas: WhatsappConversa[];
  selecionada: string | null;
  onSelecionar: (id: string) => void;
  /** Ver `EtiquetaConexao` — some quando só há uma conexão à vista. */
  mostrarConexao: boolean;
}) {
  if (carregando) return <Skeleton className="h-full w-full" />;

  return (
    <div className="h-full w-full overflow-y-auto rounded-lg border">
      {conversas.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          Nenhuma conversa ainda. Elas aparecem aqui quando um cliente escrever.
        </p>
      ) : (
        conversas.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelecionar(c.id)}
            className={`flex w-full flex-col gap-1 border-b p-3 text-left transition hover:bg-muted/50 ${
              selecionada === c.id ? "bg-muted" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">
                {c.contato.clienteRazaoSocial ??
                  c.contato.nomeExibicao ??
                  c.contato.telefoneNormalizado}
              </span>
              {c.naoLidas > 0 ? (
                <Badge className="shrink-0">{c.naoLidas}</Badge>
              ) : null}
            </div>
            {/*
              O nome que veio do WhatsApp, e não a prévia da última mensagem.
              Quando o contato está vinculado, a primeira linha mostra a razão
              social e o nome pelo qual o vendedor conhece a pessoa se perdia —
              e é ele que aparece no celular. Sem vínculo a primeira linha já é
              esse nome, então aqui fica o telefone.
            */}
            <span className="truncate text-xs text-muted-foreground">
              {(c.contato.clienteRazaoSocial ? c.contato.nomeExibicao : null) ??
                telefoneBonito(c.contato.telefoneNormalizado) ??
                "—"}
            </span>
            {mostrarConexao ? <EtiquetaConexao conversa={c} /> : null}
            <SinaisDoCliente conversa={c} />
          </button>
        ))
      )}
    </div>
  );
}

/**
 * Por qual conexão a conversa entrou.
 *
 * Só aparece para quem enxerga mais de uma: quando o supervisor lista as
 * conversas da equipe, a lista junta atendimentos de números diferentes e nada
 * dizia de qual era cada um — nem por qual número a resposta ia sair. Para o
 * vendedor, que só tem a própria conexão, a etiqueta seria a mesma em toda
 * linha, e some.
 */
function EtiquetaConexao({ conversa }: { conversa: WhatsappConversa }) {
  const numero = telefoneBonito(conversa.sessaoNumero);
  return (
    <span
      className="flex items-center gap-1 truncate text-xs text-muted-foreground"
      title={`Atendido por ${conversa.vendedorNome}${numero ? ` pelo número ${numero}` : ""}`}
    >
      <Plug className="size-3 shrink-0" />
      <span className="truncate">{conversa.vendedorNome}</span>
      {numero ? <span className="shrink-0">· {numero}</span> : null}
    </span>
  );
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
  const { diasSemComprar, situacaoTitulos, outrosAtendentes } = conversa;
  if (
    diasSemComprar == null &&
    situacaoTitulos == null &&
    outrosAtendentes.length === 0
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
    </div>
  );
}

function Conversa({
  conversaId,
  clienteId,
  onAbrirPosicao,
  onAbrirOrcamento,
}: {
  conversaId: string | null;
  /** Null = contato sem vínculo: as ferramentas do sistema não aparecem. */
  clienteId: string | null;
  onAbrirPosicao: () => void;
  onAbrirOrcamento: () => void;
}) {
  const queryClient = useQueryClient();
  const [respondendo, setRespondendo] = useState<WhatsappMensagem | null>(null);
  const fimDoRolo = useRef<HTMLDivElement>(null);

  const { data: mensagens } = useQuery({
    queryKey: ["whatsapp-mensagens", conversaId],
    queryFn: () =>
      apiFetch<WhatsappMensagem[]>(`/whatsapp/conversas/${conversaId}/mensagens`),
    enabled: !!conversaId,
    refetchInterval: 8000,
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

  // Trocar de conversa não pode manter a citação da anterior pendurada.
  useEffect(() => setRespondendo(null), [conversaId]);

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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border">
      {/* min-h-0 é o que faz a barra de rolagem ficar aqui dentro: sem ele o
          filho de um flex não encolhe abaixo do próprio conteúdo, o rolo
          cresce com as mensagens e quem rola é a página inteira. */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {(mensagens ?? []).map((m) => (
          <MensagemBolha
            key={m.id}
            mensagem={m}
            conversaId={conversaId}
            citada={m.respondeuA ? (porExternoId.get(m.respondeuA) ?? null) : null}
            onResponder={setRespondendo}
          />
        ))}
        <div ref={fimDoRolo} />
      </div>

      {/* shrink-0: o compositor tem altura própria e não deve ser espremido
          quando o rolo cresce. */}
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
            respondendo={respondendo}
            onCancelarResposta={() => setRespondendo(null)}
          />
        </div>
      </div>
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
    <div className="hidden h-full w-full flex-col overflow-hidden rounded-lg border xl:flex">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b p-3">
        <p className="text-sm font-medium">
          {modo === "posicao" ? "Posição do cliente" : "Novo orçamento"}
        </p>
        <button
          type="button"
          onClick={onFechar}
          title="Fechar"
          className="text-muted-foreground transition hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {modo === "posicao" ? (
          // A mesma tela da rotina de Posição de Cliente, com as mesmas abas
          // e filtros — sem o botão de voltar, que aqui não tem para onde ir.
          <PosicaoClienteConteudo clienteId={clienteId} mostrarVoltar={false} />
        ) : (
          // O formulário completo de Orçamentos, com o cliente já escolhido —
          // o mesmo que a cortina da Posição de Cliente usa.
          <OrcamentoFormContent
            key={clienteId}
            clienteIdPadrao={clienteId}
            onClose={onFechar}
          />
        )}
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
function PainelCliente({ conversa }: { conversa: WhatsappConversa | null }) {
  // Trocar o vínculo é raro e tem consequência (muda de quem é a conversa
  // daqui em diante), então fica atrás de um lápis em vez de ocupar o painel.
  const [trocandoVinculo, setTrocandoVinculo] = useState(false);
  const [removendoVinculo, setRemovendoVinculo] = useState(false);

  if (!conversa) {
    return <div className="hidden h-full w-full rounded-lg border xl:block" />;
  }

  const nome =
    conversa.contato.nomeExibicao ??
    conversa.contato.clienteRazaoSocial ??
    conversa.contato.telefoneNormalizado ??
    "Contato";
  const telefone = telefoneBonito(conversa.contato.telefoneNormalizado);

  return (
    <div className="hidden h-full w-full space-y-4 overflow-y-auto rounded-lg border p-4 text-sm xl:block">
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <div
          className={`flex size-20 items-center justify-center rounded-full text-2xl font-medium ${avatarColorClass(nome)}`}
        >
          {initials(nome)}
        </div>
        <div>
          <p className="font-medium">{nome}</p>
          {telefone ? (
            <p className="text-xs text-muted-foreground">{telefone}</p>
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

      <div className="border-t pt-3">
        <p className="text-xs text-muted-foreground">Atendente</p>
        <p>{conversa.vendedorNome}</p>
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
  const jaVinculado = Boolean(conversa.clienteId);

  const vincular = useMutation({
    mutationFn: (destino: string | null) =>
      apiFetch(`/whatsapp/conversas/${conversa.id}/vinculo`, {
        method: "PUT",
        body: { clienteId: destino, ignorar: false },
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

      <Button
        size="sm"
        className="w-full"
        disabled={
          !clienteId || clienteId === conversa.clienteId || vincular.isPending
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
