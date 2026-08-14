"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  AgenteConfig,
  AgentePendencia,
  AgenteResposta,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Bot, Check, Send, Sparkles, X } from "lucide-react";

interface Balao {
  papel: "usuario" | "assistente";
  texto: string;
}

/**
 * Assistente interno: ícone flutuante em qualquer tela do sistema.
 *
 * Só aparece para quem tem a permissão `agente.visualizar` **e** com o agente
 * ativo na empresa — não adianta oferecer um botão que vai responder erro.
 *
 * Ações que gravam nunca são executadas direto: o agente devolve uma pendência
 * e o usuário confirma no card. Até clicar em Confirmar, nada foi gravado.
 */
export function AgenteFab() {
  const podeUsar = useAuthStore((s) => s.hasPermission("agente", "visualizar"));
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [conversaId, setConversaId] = useState<string | undefined>();
  const [baloes, setBaloes] = useState<Balao[]>([]);
  const [pendencias, setPendencias] = useState<AgentePendencia[]>([]);
  const fim = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Só consulta a configuração se o usuário puder usar — evita 403 no console
  // de quem não tem a permissão.
  const { data: config } = useQuery({
    queryKey: ["agente-config", "disponibilidade"],
    queryFn: () => apiFetch<AgenteConfig>("/agente/config"),
    enabled: podeUsar,
    // A tela de config exige outra permissão; se falhar, tratamos como ativo e
    // deixamos o envio dar a mensagem correta.
    retry: false,
  });

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [baloes, pendencias]);

  const enviar = useMutation({
    mutationFn: (pergunta: string) =>
      apiFetch<AgenteResposta>("/agente/conversas/mensagens", {
        method: "POST",
        body: { conversaId, texto: pergunta },
      }),
    onSuccess: (r) => {
      setConversaId(r.conversaId);
      if (r.texto) setBaloes((b) => [...b, { papel: "assistente", texto: r.texto! }]);
      setPendencias(r.pendencias);
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError ? err.message : "Não consegui falar com o agente";
      setBaloes((b) => [...b, { papel: "assistente", texto: msg }]);
    },
  });

  const confirmar = useMutation({
    mutationFn: (p: AgentePendencia) =>
      apiFetch(`/agente/conversas/${conversaId}/confirmar/${p.id}`, {
        method: "POST",
      }),
    onSuccess: () => {
      setPendencias([]);
      setBaloes((b) => [
        ...b,
        { papel: "assistente", texto: "Pronto, gravado." },
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

  if (!podeUsar) return null;
  if (config && !config.ativo) return null;

  return (
    <>
      <Button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir assistente"
        className="fixed bottom-5 right-5 z-40 size-12 rounded-full shadow-lg"
      >
        <Bot className="size-5" />
      </Button>

      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-lg">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="size-4" />
              Assistente
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {baloes.length === 0 && (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Pergunte sobre a sua carteira. Alguns exemplos:
                </p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>Quanto o cliente X comprou nos últimos 6 meses?</li>
                  <li>O que eu posso oferecer para o cliente Y?</li>
                  <li>Quais clientes meus têm título vencido?</li>
                </ul>
                <p className="pt-2">
                  Eu só enxergo o que você já pode ver no sistema, e peço
                  confirmação antes de gravar qualquer coisa.
                </p>
              </div>
            )}

            {baloes.map((b, i) => (
              <div
                key={i}
                className={
                  b.papel === "usuario"
                    ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                    : "mr-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap"
                }
              >
                {b.texto}
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
                  // Enter envia; Shift+Enter quebra linha — o que todo mundo
                  // espera de um chat.
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
        </SheetContent>
      </Sheet>
    </>
  );
}
