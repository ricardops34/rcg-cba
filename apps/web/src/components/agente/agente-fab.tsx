"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  AgenteAnexo,
  AgenteConfirmacao,
  AgenteConversa,
  AgenteConversaResumo,
  AgenteDestino,
  AgenteEvento,
  AgentePendencia,
  AgenteResposta,
} from "@plataforma/contracts";
import { ApiError, apiFetch, apiStream, apiUpload } from "@/lib/api-client";
import { useAgenteUiStore } from "@/stores/agente-ui-store";
import { JanelaFlutuante } from "@/components/ui/janela-flutuante";
import { useAtendimentoJanelaStore } from "@/stores/atendimento-janela-store";
import type { AbaJanela } from "@/stores/agente-ui-store";
import {
  AbaWhatsapp,
  useAtendimentoDisponivel,
} from "@/components/whatsapp/atendimento-cliente-janela";
import { useAgente } from "@/components/agente/use-agente";
import { ConteudoMensagem } from "@/components/agente/conteudo-mensagem";
import { useResumoDiario } from "@/components/agente/use-resumo-diario";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import {
  Check,
  Eraser,
  ExternalLink,
  HelpCircle,
  History,
  MessageCircle,
  Paperclip,
  Send,
  Sparkles,
  X,
} from "lucide-react";

interface Balao {
  papel: "usuario" | "assistente";
  texto: string;
  resumoDiario?: boolean;
  /** Telas onde ver o que a resposta resumiu — vêm do servidor, por turno. */
  destinos?: AgenteDestino[];
}

/**
 * Assistente interno: a janela, disponível em qualquer tela do sistema.
 *
 * Abre pelo ícone da topbar (`AgenteBotaoTopbar`), que mexe no mesmo
 * `agente-ui-store`. É a única porta de entrada: o botão flutuante no canto da
 * tela foi removido — pousava em cima da coluna de ações das listagens.
 *
 * A janela **não é modal de propósito**. Antes era um `Sheet`, que cobre a tela
 * com um overlay e captura o clique: consultar o agente obrigava a fechá-lo
 * antes de mexer no sistema, justamente quando o que se quer é conferir na tela
 * o que ele respondeu. Aqui ela flutua, se move, se redimensiona e volta ao
 * ícone — o resto do sistema segue clicável atrás.
 *
 * Minimizar **é** voltar ao ícone: a janela some inteira e a conversa fica
 * viva. O que chegar enquanto ela está escondida acende um indicador no ícone
 * — âmbar com "!" quando há ação parada esperando o Confirmar, ponto verde
 * quando é só resposta nova.
 *
 * Só aparece para quem tem a permissão `agente.visualizar` **e** com o agente
 * ativo na empresa — não adianta oferecer um botão que vai responder erro.
 *
 * Ações que gravam nunca são executadas direto: o agente devolve uma pendência
 * e o usuário confirma no card. Até clicar em Confirmar, nada foi gravado.
 */
export function AgenteFab() {
  const usuarioId = useAuthStore((s) => s.user?.id);
  const empresaId = useAuthStore((s) => s.user?.empresaAtivaId);
  return <AgenteJanela key={`${usuarioId}:${empresaId}`} />;
}

function AgenteJanela() {
  const { disponivel, nomeAgente, boasVindas } = useAgente();
  // Abrir, minimizar e os avisos moram no store: o ícone da topbar mexe nos
  // mesmos estados, e a janela é uma só.
  const aberto = useAgenteUiStore((s) => s.aberto);
  const minimizar = useAgenteUiStore((s) => s.minimizar);
  const setNovidade = useAgenteUiStore((s) => s.setNovidade);
  const setPendente = useAgenteUiStore((s) => s.setPendente);
  const aba = useAgenteUiStore((s) => s.aba);
  const setAba = useAgenteUiStore((s) => s.setAba);
  // A aba WhatsApp só existe com o atendimento disponível (WhatsApp ligado e
  // instância própria); a da Bia, só com o agente ativo. Com uma só, não há
  // abas — e a que existe é a visível, qualquer que seja a última escolhida.
  const whatsappDisponivel = useAtendimentoDisponivel();
  const clienteWhatsapp = useAtendimentoJanelaStore((s) => s.cliente?.nome ?? null);
  const ambas = disponivel && whatsappDisponivel;
  const abaAtiva = !disponivel ? "whatsapp" : !whatsappDisponivel ? "bia" : aba;
  /** A moldura já apareceu uma vez — a primeira rolagem depende do conteúdo montado. */
  const [pronta, setPronta] = useState(false);
  const [texto, setTexto] = useState("");
  /**
   * O arquivo anexado ao **próximo** envio.
   *
   * Vale para uma mensagem só: o assistente lê o documento uma vez e o que
   * fica gravado é o resultado — a ficha em Markdown, a foto no produto. Por
   * isso ele é limpo depois de enviar, e não fica pendurado na conversa.
   */
  const [anexo, setAnexo] = useState<AgenteAnexo | null>(null);
  const [subindo, setSubindo] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [conversaId, setConversaId] = useState<string | undefined>();
  const [baloes, setBaloes] = useState<Balao[]>([]);
  const [pendencias, setPendencias] = useState<AgentePendencia[]>([]);
  /**
   * O passo que o servidor está executando agora, em texto.
   *
   * Uma pergunta que encadeia três ferramentas leva dezenas de segundos, e
   * até aqui a janela dizia só "Consultando..." o tempo todo — o que não
   * distingue um turno vivo de um turno travado. Chega por evento (ver
   * `apiStream`) e volta a nulo no fim do turno.
   */
  const [progresso, setProgresso] = useState<string | null>(null);
  /** A lista de conversas anteriores está aberta. */
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const inicioResumo = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const apresentarResumo = useCallback((mensagem: string) => {
    setBaloes((atuais) => [...atuais, { papel: "assistente", texto: mensagem, resumoDiario: true }]);
    setHistoricoAberto(false);
    useAgenteUiStore.getState().setAba("bia");
    useAgenteUiStore.getState().abrir();
  }, []);
  useResumoDiario(disponivel, apresentarResumo);

  // Pendência é ação parada esperando gente. Quem mostra o "!" é o ícone da
  // topbar, então o estado tem de chegar até ele.
  useEffect(() => {
    setPendente(pendencias.length > 0);
  }, [pendencias, setPendente]);

  useEffect(() => {
    if (!aberto) return;
    if (baloes.at(-1)?.resumoDiario) inicioResumo.current?.scrollIntoView({ block: "start" });
    else fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [baloes, pendencias, aberto, pronta, abaAtiva]);

  const enviar = useMutation({
    mutationFn: async ({
      pergunta,
      anexoId,
    }: {
      pergunta: string;
      anexoId?: string;
    }) => {
      // Um objeto, e não duas `let`: o TypeScript não acompanha atribuição
      // feita dentro do callback, e a variável solta continuaria estreitada
      // para `null` depois do laço.
      const colhido: { resposta?: AgenteResposta; erro?: string } = {};

      await apiStream<AgenteEvento>(
        "/agente/conversas/mensagens/stream",
        { conversaId, texto: pergunta, anexoId },
        (e) => {
          if (e.tipo === "ferramenta") setProgresso(e.rotulo);
          else if (e.tipo === "fim") colhido.resposta = e.resposta;
          else if (e.tipo === "erro") colhido.erro = e.mensagem;
        },
      );

      if (colhido.erro) throw new ApiError(colhido.erro, 0);
      if (!colhido.resposta) {
        // Stream fechou sem o "fim": conexão caiu no meio. A pergunta já está
        // gravada no servidor, mas a resposta não chegou aqui.
        throw new ApiError("A resposta foi interrompida. Tente de novo.", 0);
      }
      return colhido.resposta;
    },
    onSettled: () => setProgresso(null),
    onSuccess: (r) => {
      setConversaId(r.conversaId);
      if (r.texto) {
        setBaloes((b) => [
          ...b,
          { papel: "assistente", texto: r.texto!, destinos: r.destinos },
        ]);
      }
      setPendencias(r.pendencias);
      // A conversa nova (ou a que acabou de receber mensagem) muda a ordem e o
      // título da lista — sem isto o painel mostraria o estado de antes.
      void queryClient.invalidateQueries({ queryKey: ["agente-conversas"] });
      // Perguntou e foi cuidar da vida: o ícone avisa que a resposta chegou.
      if (!useAgenteUiStore.getState().aberto) setNovidade(true);
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Não consegui falar com o agente";
      setBaloes((b) => [...b, { papel: "assistente", texto: msg }]);
      if (!useAgenteUiStore.getState().aberto) setNovidade(true);
    },
  });

  const confirmar = useMutation({
    mutationFn: (p: AgentePendencia) =>
      apiFetch<AgenteConfirmacao>(
        `/agente/conversas/${conversaId}/confirmar/${p.id}`,
        { method: "POST" },
      ),
    onSuccess: (r) => {
      setPendencias([]);
      setBaloes((b) => [
        ...b,
        {
          papel: "assistente",
          texto: "Pronto, gravado.",
          // O que foi gravado tem tela — inclusive a fila de aprovação, quando
          // a ação depende de alguém liberar.
          destinos: r.destinos,
        },
      ]);
      // O que foi gravado aparece em outras telas — invalida o cache geral.
      void queryClient.invalidateQueries();
      toast.success("Ação executada");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Erro ao confirmar"),
  });

  const cancelar = useMutation({
    mutationFn: (p: AgentePendencia) =>
      apiFetch(`/agente/conversas/${conversaId}/cancelar/${p.id}`, {
        method: "POST",
      }),
    onSuccess: () => {
      setPendencias([]);
      setBaloes((b) => [
        ...b,
        { papel: "assistente", texto: "Ok, não gravei nada." },
      ]);
    },
  });

  const onEnviar = () => {
    const pergunta = texto.trim();
    if (!pergunta || enviar.isPending) return;
    setBaloes((b) => [
      ...b,
      {
        papel: "usuario",
        texto: anexo ? `${pergunta}

📎 ${anexo.arquivoNome}` : pergunta,
      },
    ]);
    setTexto("");
    // Perguntar é sair da lista: a resposta vem na conversa, atrás do painel.
    setHistoricoAberto(false);
    enviar.mutate({ pergunta, anexoId: anexo?.id });
    setAnexo(null);
  };

  /** Sobe o arquivo antes do envio: a mensagem só carrega o id. */
  const onAnexar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = event.target.files?.[0];
    // Limpa já, senão escolher o mesmo arquivo duas vezes não dispara o evento.
    event.target.value = "";
    if (!arquivo) return;
    setSubindo(true);
    try {
      setAnexo(await apiUpload<AgenteAnexo>("/agente/anexos", arquivo));
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Não consegui subir o arquivo",
      );
    } finally {
      setSubindo(false);
    }
  };

  /**
   * Encerra a conversa: esvazia a tela e **solta o `conversaId`**, então a
   * próxima pergunta começa do zero, sem o histórico anterior no contexto do
   * modelo. O que já foi gravado continua no banco — é registro de auditoria
   * (quem perguntou o quê, e o que a ferramenta devolveu), e não é a tela que
   * apaga isso.
   */
  const encerrar = () => {
    setConversaId(undefined);
    setBaloes([]);
    setPendencias([]);
    setTexto("");
    setHistoricoAberto(false);
    toast.success("Conversa encerrada");
  };

  /**
   * As conversas anteriores desta pessoa.
   *
   * Só busca com o painel aberto: a lista não é o caminho comum — quem abre o
   * assistente quase sempre vem perguntar algo novo —, e uma consulta em toda
   * abertura da janela seria paga por todo mundo para servir a poucos.
   */
  const { data: conversas } = useQuery({
    queryKey: ["agente-conversas"],
    queryFn: () => apiFetch<AgenteConversaResumo[]>("/agente/conversas"),
    enabled: aberto && historicoAberto,
  });

  /**
   * Reabre uma conversa: traz as mensagens gravadas e volta a apontar para ela.
   *
   * O `conversaId` é o que faz a próxima pergunta continuar de onde parou, em
   * vez de abrir outra conversa — sem ele a tela mostraria o histórico e o
   * modelo não o teria no contexto, que é a pior combinação possível.
   *
   * Pendências não são remontadas de propósito: uma ação preparada ontem e não
   * confirmada não deve reaparecer como um botão "Confirmar" no meio de uma
   * conversa retomada, fora do assunto que a originou.
   */
  const abrirConversa = useMutation({
    mutationFn: (id: string) =>
      apiFetch<AgenteConversa>(`/agente/conversas/${id}`),
    onSuccess: (c) => {
      setConversaId(c.id);
      setPendencias([]);
      setBaloes(
        c.mensagens
          // Só o que foi dito. As linhas de ferramenta são registro de
          // auditoria — o que elas devolveram já está redigido na resposta ao
          // lado, e mostrá-las aqui seria repetir em JSON o que a prosa diz.
          .filter(
            (m) =>
              (m.papel === "usuario" || m.papel === "assistente") && m.conteudo,
          )
          .map((m) => ({
            papel: m.papel as "usuario" | "assistente",
            texto: m.conteudo as string,
          })),
      );
      setHistoricoAberto(false);
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Não consegui abrir a conversa",
      ),
  });

  if (!disponivel && !whatsappDisponivel) return null;

  return (
    <JanelaFlutuante
      aberto={aberto}
      rotulo="Assistente"
      icone={
        ambas ? null : abaAtiva === "bia" ? (
          <Sparkles className="size-4 shrink-0" />
        ) : (
          <MessageCircle className="size-4 shrink-0 text-[#00A884]" />
        )
      }
      // O nome que a empresa deu ao agente, não um rótulo fixo.
      titulo={
        ambas ? (
          <AbasJanela
            nomeAgente={nomeAgente}
            abaAtiva={abaAtiva}
            onTrocar={setAba}
            cliente={clienteWhatsapp}
          />
        ) : abaAtiva === "bia" ? (
          nomeAgente
        ) : (
          `WhatsApp${clienteWhatsapp ? ` · ${clienteWhatsapp}` : ""}`
        )
      }
      // Minimizar e fechar são a mesma coisa — os dois voltam ao ícone e a
      // conversa continua viva. Ficam os dois porque é onde a mão vai: uns
      // procuram o traço, outros o X. Para apagar a conversa existe a
      // borracha, ao lado.
      onMinimizar={minimizar}
      onFechar={minimizar}
      tituloMinimizar="Minimizar para o ícone (a conversa continua)"
      tituloFechar="Fechar (a conversa continua)"
      onPronta={() => setPronta(true)}
      // Ajuda, histórico e borracha são da Bia: na aba WhatsApp não valem.
      acoes={abaAtiva !== "bia" ? null : (
        <>
        <Button
          asChild
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          title="Como usar — o que dá para pedir"
          aria-label="Ajuda do assistente"
        >
          <Link href="/assistente/ajuda">
            <HelpCircle className="size-4" />
          </Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`size-7${historicoAberto ? " bg-muted" : ""}`}
          title="Conversas anteriores"
          aria-label="Conversas anteriores"
          aria-pressed={historicoAberto}
          onClick={() => setHistoricoAberto((v) => !v)}
        >
          <History className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          title="Encerrar e limpar a conversa"
          aria-label="Encerrar e limpar a conversa"
          onClick={encerrar}
          disabled={baloes.length === 0 && !conversaId}
        >
          <Eraser className="size-4" />
        </Button>
        </>
      )}
    >
      {abaAtiva === "whatsapp" ? (
        <AbaWhatsapp />
      ) : (
      <>
      {/* A lista cobre a conversa em vez de dividir a janela: ela já é
          estreita, e partir a altura em duas deixaria as duas ilegíveis.
          Escolher uma conversa fecha o painel e devolve a leitura inteira. */}
      {historicoAberto && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {!conversas && (
            <p className="p-2 text-sm text-muted-foreground">Carregando…</p>
          )}
          {conversas?.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">
              Nenhuma conversa anterior ainda.
            </p>
          )}
          {conversas?.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={abrirConversa.isPending}
              onClick={() => abrirConversa.mutate(c.id)}
              className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-muted disabled:opacity-50${
                c.id === conversaId ? " bg-muted" : ""
              }`}
            >
              {/* O título é a primeira pergunta cortada — é o que a pessoa
                  reconhece, muito mais do que uma data sozinha. */}
              <span className="line-clamp-2 text-sm">
                {c.titulo || "Conversa sem título"}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(c.updatedAt).toLocaleString("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
            </button>
          ))}
        </div>
      )}

      <div
        className={`min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4${
          historicoAberto ? " hidden" : ""
        }`}
      >
        {/* Conversa nova abre com a saudação da empresa, como um balão do
            próprio agente — a tela em branco não diz o que dá para pedir.
            Volta a aparecer depois de encerrar a conversa. */}
        {baloes.length === 0 && (
          <div className="space-y-3">
            <div className="mr-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
              {boasVindas}
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Alguns exemplos:</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>Quanto o cliente X comprou nos últimos 6 meses?</li>
                <li>O que eu posso oferecer para o cliente Y?</li>
                <li>Quais clientes meus têm título vencido?</li>
              </ul>
              <p className="pt-1">
                Eu só enxergo o que você já pode ver no sistema, e peço
                confirmação antes de gravar qualquer coisa.{" "}
                <Link
                  href="/assistente/ajuda"
                  className="underline underline-offset-2"
                >
                  Ver tudo o que eu sei fazer
                </Link>
                .
              </p>
            </div>
          </div>
        )}

        {baloes.map((b, i) => (
          <div key={i} ref={b.resumoDiario ? inicioResumo : undefined} className="space-y-1">
            <div
              className={
                b.papel === "usuario"
                  ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : "mr-auto min-w-0 max-w-full rounded-lg bg-muted px-3 py-2 text-sm"
              }
            >
              {b.papel === "usuario" ? b.texto : <ConteudoMensagem texto={b.texto} />}
            </div>
            {/* O chat resume; a tela tem o resto. O link vem montado do
                    servidor, com os ids reais — o modelo não escreve link.
                    Navega por baixo da janela, que fica onde está. */}
            {b.destinos && b.destinos.length > 0 && (
              <div className="mr-auto flex max-w-[85%] flex-wrap gap-1">
                {b.destinos.map((d) => (
                  <Button
                    key={d.rota}
                    asChild
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                  >
                    <Link href={d.rota}>
                      {d.rotulo}
                      <ExternalLink className="size-3" />
                    </Link>
                  </Button>
                ))}
              </div>
            )}
          </div>
        ))}

        {enviar.isPending && (
          <div className="mr-auto flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-current" />
            {/* O rótulo do passo, quando o servidor já contou qual é. Até a
                primeira ferramenta responder, o modelo ainda está lendo a
                pergunta — e aí "Pensando" é a verdade. */}
            {progresso ?? "Pensando"}…
          </div>
        )}

        {pendencias.map((p) => (
          <div
            key={p.id}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
          >
            <p className="font-medium">Confirmar esta ação?</p>
            <p className="pt-1">{p.resumo}</p>
            <p className="pt-1 text-xs text-muted-foreground">
              Nada foi gravado ainda.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => cancelar.mutate(p)}
                disabled={cancelar.isPending}
              >
                <X className="size-4" />
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => confirmar.mutate(p)}
                disabled={confirmar.isPending}
              >
                <Check className="size-4" />
                Confirmar e gravar
              </Button>
            </div>
          </div>
        ))}
        <div ref={fim} />
      </div>

      <div className="shrink-0 border-t p-3">
        {anexo && (
          <div className="mb-2 flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-xs">
            <Paperclip className="size-3.5 shrink-0" />
            <span className="truncate">{anexo.arquivoNome}</span>
            <button
              type="button"
              className="ml-auto text-muted-foreground hover:text-foreground"
              onClick={() => setAnexo(null)}
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            className="min-w-0 resize-none"
            rows={2}
            value={texto}
            placeholder="Pergunte alguma coisa..."
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              // Enter envia; Shift+Enter quebra linha — o que todo
              // mundo espera de um chat.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onEnviar();
              }
            }}
          />
          <input
            ref={inputArquivo}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => void onAnexar(e)}
          />
          <Button
            type="button"
            variant="outline"
            title="Anexar PDF ou imagem"
            disabled={subindo || enviar.isPending}
            onClick={() => inputArquivo.current?.click()}
          >
            <Paperclip className="size-4" />
          </Button>
          <Button
            type="button"
            onClick={onEnviar}
            disabled={enviar.isPending || !texto.trim()}
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
      </>
      )}
    </JanelaFlutuante>
  );
}

/**
 * As abas da janela, no lugar do título: a Bia e o atendimento de WhatsApp.
 * São botões dentro da barra de título — o arrasto da janela ignora botão,
 * então trocar de aba nunca vira mover a janela.
 */
function AbasJanela({
  nomeAgente,
  abaAtiva,
  onTrocar,
  cliente,
}: {
  nomeAgente: string;
  abaAtiva: AbaJanela;
  onTrocar: (aba: AbaJanela) => void;
  cliente: string | null;
}) {
  const classe = (ativa: boolean) =>
    `flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors ${
      ativa
        ? "bg-background font-medium text-foreground shadow-xs"
        : "text-muted-foreground hover:text-foreground"
    }`;
  return (
    <span role="tablist" aria-label="Janela do assistente" className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        role="tab"
        aria-selected={abaAtiva === "bia"}
        className={classe(abaAtiva === "bia")}
        onClick={() => onTrocar("bia")}
      >
        <Sparkles className="size-3.5 shrink-0" />
        <span className="truncate">{nomeAgente}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={abaAtiva === "whatsapp"}
        className={classe(abaAtiva === "whatsapp")}
        onClick={() => onTrocar("whatsapp")}
        title={cliente ?? undefined}
      >
        <MessageCircle className="size-3.5 shrink-0 text-[#00A884]" />
        <span className="truncate">{cliente ?? "WhatsApp"}</span>
      </button>
    </span>
  );
}
