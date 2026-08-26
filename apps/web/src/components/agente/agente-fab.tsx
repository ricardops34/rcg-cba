"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  AgenteConfirmacao,
  AgenteDestino,
  AgentePendencia,
  AgenteResposta,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAgenteUiStore } from "@/stores/agente-ui-store";
import { useAgente } from "@/components/agente/use-agente";
import {
  AgenteIndicador,
  rotuloAgente,
} from "@/components/agente/agente-indicador";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import {
  Bot,
  Check,
  Eraser,
  ExternalLink,
  HelpCircle,
  Minus,
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
const CHAVE_GEOMETRIA = "agente-janela";

const limitar = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), Math.max(min, max));

/** Encosta a janela no canto inferior direito, que é de onde o botão a abre. */
function geometriaPadrao(): Geometria {
  const largura = Math.min(420, window.innerWidth - MARGEM * 2);
  const altura = Math.min(560, window.innerHeight - MARGEM * 2);
  return {
    largura,
    altura,
    x: window.innerWidth - largura - MARGEM,
    y: window.innerHeight - altura - MARGEM,
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
  const largura = limitar(
    g.largura,
    LARGURA_MIN,
    window.innerWidth - MARGEM * 2,
  );
  const altura = limitar(g.altura, ALTURA_MIN, window.innerHeight - MARGEM * 2);
  return {
    largura,
    altura,
    x: limitar(g.x, MARGEM, window.innerWidth - largura - MARGEM),
    // O rodapé pode encostar na borda de baixo; a barra de título, nunca sai
    // da tela — é por ela que a janela é trazida de volta.
    y: limitar(g.y, MARGEM, window.innerHeight - ALTURA_TITULO - MARGEM),
  };
}

/**
 * Assistente interno: a janela, disponível em qualquer tela do sistema.
 *
 * Abre por dois caminhos, e os dois mexem no mesmo `agente-ui-store`: o botão
 * flutuante daqui e o ícone da topbar (`AgenteBotaoTopbar`). O flutuante pode
 * ser desligado por quem prefere a tela limpa; o da topbar é fixo, para o
 * assistente nunca ficar sem porta de entrada.
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
  const flutuante = useAgenteUiStore((s) => s.flutuante);
  const novidade = useAgenteUiStore((s) => s.novidade);
  const pendente = useAgenteUiStore((s) => s.pendente);
  const abrir = useAgenteUiStore((s) => s.abrir);
  const minimizar = useAgenteUiStore((s) => s.minimizar);
  const setNovidade = useAgenteUiStore((s) => s.setNovidade);
  const setPendente = useAgenteUiStore((s) => s.setPendente);
  const [geometria, setGeometria] = useState<Geometria | null>(null);
  const [texto, setTexto] = useState("");
  const [conversaId, setConversaId] = useState<string | undefined>();
  const [baloes, setBaloes] = useState<Balao[]>([]);
  const [pendencias, setPendencias] = useState<AgentePendencia[]>([]);
  const fim = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  /**
   * Posição e tamanho só existem no cliente (dependem da viewport) e ficam
   * guardados entre sessões: quem arrumou a janela onde queria não quer
   * arrumá-la de novo a cada login.
   *
   * Resolvido aqui, num efeito, e não no clique que abre: quem abre pode ser o
   * botão flutuante **ou** o ícone da topbar, e a topbar não tem por que
   * conhecer a geometria da janela. Depende de `window`, então só no cliente.
   */
  useEffect(() => {
    if (!aberto || geometria) return;
    let salva: Geometria | null = null;
    try {
      const bruto = localStorage.getItem(CHAVE_GEOMETRIA);
      if (bruto) salva = JSON.parse(bruto) as Geometria;
    } catch {
      // Storage bloqueado ou JSON corrompido: cai no padrão, sem quebrar.
    }
    setGeometria(acomodar(salva ?? geometriaPadrao()));
  }, [aberto, geometria]);

  // Pendência é ação parada esperando gente. Quem mostra o "!" é o ícone —
  // flutuante ou da topbar —, então o estado tem de chegar até ele.
  useEffect(() => {
    setPendente(pendencias.length > 0);
  }, [pendencias, setPendente]);

  useEffect(() => {
    if (!geometria) return;
    try {
      localStorage.setItem(CHAVE_GEOMETRIA, JSON.stringify(geometria));
    } catch {
      // Sem persistência é aceitável; sem assistente, não.
    }
  }, [geometria]);

  useEffect(() => {
    if (!aberto) return;
    const aoRedimensionar = () => setGeometria((g) => (g ? acomodar(g) : g));
    window.addEventListener("resize", aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
  }, [aberto]);

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
    mutationFn: (pergunta: string) =>
      apiFetch<AgenteResposta>("/agente/conversas/mensagens", {
        method: "POST",
        body: { conversaId, texto: pergunta },
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
    setBaloes((b) => [...b, { papel: "usuario", texto: pergunta }]);
    setTexto("");
    enviar.mutate(pergunta);
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

  if (!disponivel) return null;

  return (
    <>
      {/* O botão flutuante é **opcional**: quem acha que ele atrapalha a tela
          desliga no menu da conta (avatar da topbar) e passa a abrir o assistente
          pelo ícone da topbar, que está sempre lá. */}
      {!aberto && flutuante && (
        <Button
          type="button"
          onClick={abrir}
          aria-label={rotuloAgente(pendente, novidade)}
          className="fixed bottom-5 right-5 z-40 size-12 rounded-full shadow-lg"
        >
          <Bot className="size-5" />
          {(pendente || novidade) && <AgenteIndicador pendente={pendente} />}
        </Button>
      )}

      {aberto && geometria && (
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
            className="flex cursor-move touch-none select-none items-center gap-2 border-b bg-muted/40 px-3"
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

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
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
      )}
    </>
  );
}
