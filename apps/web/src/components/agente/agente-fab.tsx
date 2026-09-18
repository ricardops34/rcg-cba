"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  AgenteAnexo,
  AgenteConfirmacao,
  AgenteDestino,
  AgentePendencia,
  AgenteResposta,
} from "@plataforma/contracts";
import { ApiError, apiFetch, apiUpload } from "@/lib/api-client";
import { useAgenteUiStore } from "@/stores/agente-ui-store";
import { useAgente } from "@/components/agente/use-agente";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import {
  Check,
  Eraser,
  ExternalLink,
  HelpCircle,
  Minus,
  Paperclip,
  Send,
  Sparkles,
  X,
} from "lucide-react";

interface Balao {
  papel: "usuario" | "assistente";
  texto: string;
  /** Telas onde ver o que a resposta resumiu — vêm do servidor, por turno. */
  destinos?: AgenteDestino[];
}

interface Geometria {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

const LARGURA_MIN = 320;
const ALTURA_MIN = 320;
const MARGEM = 8;
/** Altura da barra de título — a faixa por onde a janela é arrastada. */
const ALTURA_TITULO = 44;

function viewport() {
  const visual = window.visualViewport;
  return {
    largura: visual?.width ?? window.innerWidth,
    altura: visual?.height ?? window.innerHeight,
    x: visual?.offsetLeft ?? 0,
    y: visual?.offsetTop ?? 0,
  };
}

const limitar = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), Math.max(min, max));

/** Encosta a janela no canto inferior direito, longe do ícone que a abre. */
function geometriaPadrao(): Geometria {
  const tela = viewport();
  const compacta = tela.largura < 640;
  const largura = Math.max(1, Math.min(compacta ? tela.largura : 420, tela.largura - MARGEM * 2));
  const altura = Math.max(1, Math.min(compacta ? tela.altura : 560, tela.altura - MARGEM * 2));
  return {
    largura,
    altura,
    x: tela.x + tela.largura - largura - MARGEM,
    y: tela.y + tela.altura - altura - MARGEM,
  };
}

/**
 * Mantém a janela dentro da viewport.
 *
 * Roda no arrasto, no redimensionamento e quando a **janela do navegador**
 * muda de tamanho: sem isso, quem move o assistente para a direita e depois
 * reduz a tela (ou gira o tablet) perde a barra de título — e com ela o único
 * jeito de trazer a janela de volta.
 */
function acomodar(g: Geometria): Geometria {
  const tela = viewport();
  if (tela.largura < 640) return geometriaPadrao();
  const larguraDisponivel = Math.max(1, tela.largura - MARGEM * 2);
  const alturaDisponivel = Math.max(1, tela.altura - MARGEM * 2);
  const largura = limitar(
    g.largura,
    Math.min(LARGURA_MIN, larguraDisponivel),
    larguraDisponivel,
  );
  const altura = limitar(g.altura, Math.min(ALTURA_MIN, alturaDisponivel), alturaDisponivel);
  return {
    largura,
    altura,
    x: limitar(g.x, tela.x + MARGEM, tela.x + tela.largura - largura - MARGEM),
    // Preserva também o rodapé com o campo de mensagem, não só o título.
    y: limitar(g.y, tela.y + MARGEM, tela.y + tela.altura - altura - MARGEM),
  };
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
  const { disponivel, nomeAgente, boasVindas } = useAgente();
  // Abrir, minimizar e os avisos moram no store: o ícone da topbar mexe nos
  // mesmos estados, e a janela é uma só.
  const aberto = useAgenteUiStore((s) => s.aberto);
  const minimizar = useAgenteUiStore((s) => s.minimizar);
  const setNovidade = useAgenteUiStore((s) => s.setNovidade);
  const setPendente = useAgenteUiStore((s) => s.setPendente);
  const [geometria, setGeometria] = useState<Geometria | null>(null);
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
  const fim = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Cada abertura usa a tela atual, sem coordenadas salvas de outro monitor.
  useEffect(() => {
    if (!aberto) return;
    const frame = window.requestAnimationFrame(() => {
      setGeometria(geometriaPadrao());
    });
    return () => window.cancelAnimationFrame(frame);
  }, [aberto]);

  // Pendência é ação parada esperando gente. Quem mostra o "!" é o ícone da
  // topbar, então o estado tem de chegar até ele.
  useEffect(() => {
    setPendente(pendencias.length > 0);
  }, [pendencias, setPendente]);

  useEffect(() => {
    const aoRedimensionar = () => setGeometria((g) => (g ? geometriaPadrao() : g));
    const visual = window.visualViewport;
    window.addEventListener("resize", aoRedimensionar);
    visual?.addEventListener("resize", aoRedimensionar);
    visual?.addEventListener("scroll", aoRedimensionar);
    return () => {
      window.removeEventListener("resize", aoRedimensionar);
      visual?.removeEventListener("resize", aoRedimensionar);
      visual?.removeEventListener("scroll", aoRedimensionar);
    };
  }, []);

  useEffect(() => {
    if (aberto) fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [baloes, pendencias, aberto]);

  /**
   * Arrasto e redimensionamento com Pointer Events e captura de ponteiro: o
   * movimento continua valendo mesmo quando o cursor sai da janela ou passa
   * por cima de um iframe, o que `mousemove` no documento não garante.
   */
  const iniciarGesto = useCallback(
    (modo: "mover" | "redimensionar") => (e: React.PointerEvent) => {
      // Só botão principal, e nunca a partir dos botões do cabeçalho.
      if (e.button !== 0) return;
      if (viewport().largura < 640) return;
      if (
        modo === "mover" &&
        (e.target as HTMLElement).closest("button, input, textarea")
      ) {
        return;
      }
      e.preventDefault();
      const alvo = e.currentTarget as HTMLElement;
      alvo.setPointerCapture(e.pointerId);
      const inicio = { x: e.clientX, y: e.clientY };
      const base = geometria;
      if (!base) return;

      const mover = (ev: PointerEvent) => {
        const dx = ev.clientX - inicio.x;
        const dy = ev.clientY - inicio.y;
        setGeometria(
          acomodar(
            modo === "mover"
              ? { ...base, x: base.x + dx, y: base.y + dy }
              : {
                  ...base,
                  largura: base.largura + dx,
                  altura: base.altura + dy,
                },
          ),
        );
      };
      const soltar = () => {
        alvo.releasePointerCapture(e.pointerId);
        alvo.removeEventListener("pointermove", mover);
        alvo.removeEventListener("pointerup", soltar);
        alvo.removeEventListener("pointercancel", soltar);
      };
      alvo.addEventListener("pointermove", mover);
      alvo.addEventListener("pointerup", soltar);
      alvo.addEventListener("pointercancel", soltar);
    },
    [geometria],
  );

  const enviar = useMutation({
    mutationFn: ({ pergunta, anexoId }: { pergunta: string; anexoId?: string }) =>
      apiFetch<AgenteResposta>("/agente/conversas/mensagens", {
        method: "POST",
        body: { conversaId, texto: pergunta, anexoId },
      }),
    onSuccess: (r) => {
      setConversaId(r.conversaId);
      if (r.texto) {
        setBaloes((b) => [
          ...b,
          { papel: "assistente", texto: r.texto!, destinos: r.destinos },
        ]);
      }
      setPendencias(r.pendencias);
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
    toast.success("Conversa encerrada");
  };

  if (!disponivel || !aberto || !geometria) return null;

  return createPortal(
    <div
      role="dialog"
      aria-label="Assistente"
      className="fixed z-50 flex flex-col overflow-hidden rounded-lg border bg-background shadow-2xl"
      style={{
        left: geometria.x,
        top: geometria.y,
        width: geometria.largura,
        height: geometria.altura,
      }}
    >
      <div
        onPointerDown={iniciarGesto("mover")}
        onDoubleClick={minimizar}
        className="flex shrink-0 touch-none select-none items-center gap-2 border-b bg-muted/40 px-3 sm:cursor-move"
        style={{ height: ALTURA_TITULO }}
      >
        <Sparkles className="size-4 shrink-0" />
        {/* O nome que a empresa deu ao agente, não um rótulo fixo. */}
        <span className="flex-1 truncate text-sm font-medium">
          {nomeAgente}
        </span>
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
          className="size-7"
          title="Encerrar e limpar a conversa"
          aria-label="Encerrar e limpar a conversa"
          onClick={encerrar}
          disabled={baloes.length === 0 && !conversaId}
        >
          <Eraser className="size-4" />
        </Button>
        {/* Minimizar e fechar viraram a mesma coisa — os dois voltam ao
            ícone e a conversa continua viva. Ficam os dois porque é onde a
            mão vai: uns procuram o traço, outros o X. Para apagar a
            conversa existe a borracha, ao lado. */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          title="Minimizar para o ícone (a conversa continua)"
          aria-label="Minimizar para o ícone"
          onClick={minimizar}
        >
          <Minus className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          title="Fechar (a conversa continua)"
          aria-label="Fechar assistente"
          onClick={minimizar}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
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
          <div key={i} className="space-y-1">
            <div
              className={
                b.papel === "usuario"
                  ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : "mr-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap"
              }
            >
              {b.texto}
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
          <div className="mr-auto rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Consultando...
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

      <div className="border-t p-3">
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

      {/* Alça de redimensionamento. `touch-none` para o gesto não virar
              rolagem no tablet. */}
      <div
        onPointerDown={iniciarGesto("redimensionar")}
        role="separator"
        aria-label="Redimensionar assistente"
        className="absolute bottom-0 right-0 size-4 cursor-nwse-resize touch-none text-border"
        style={{
          // `currentColor` para não depender do formato do token de
          // cor (hsl/oklch): a cor vem do `text-border` acima.
          background:
            "linear-gradient(135deg, transparent 50%, currentColor 50%)",
        }}
      />
    </div>
  );
}
