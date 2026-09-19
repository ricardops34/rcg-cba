"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Clock,
  FileText,
  Image as ImageIcon,
  Mic,
  Paperclip,
  Plus,
  Send,
  Square,
  Sparkles,
  Zap,
  Loader2,
  X,
} from "lucide-react";
import { RespostasRapidasPopover } from "@/components/whatsapp/respostas-rapidas-popover";
import { RespostasRapidasDialog } from "@/components/whatsapp/respostas-rapidas-dialog";
import {
  WHATSAPP_ARQUIVO_MAX_BYTES,
  type WhatsappMensagem,
  type WhatsappMensagemAgendada,
  type WhatsappTemplate,
} from "@plataforma/contracts";
import { ApiError, apiFetch, apiUpload, ehJanelaWhatsappFechada } from "@/lib/api-client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Barra de composição da conversa — o que o vendedor espera de um WhatsApp:
 * texto, anexo (documento, foto/vídeo), áudio gravado na hora e resposta a uma
 * mensagem citada.
 *
 * O áudio é gravado pelo navegador (`MediaRecorder`) e sobe como mensagem de
 * voz (`ptt`), não como arquivo anexado: no celular do cliente a diferença é
 * visível — uma toca no player, a outra vira um anexo que ele precisa baixar.
 */
export function Composer({
  conversaId,
  respondendo,
  onCancelarResposta,
}: {
  conversaId: string;
  respondendo: WhatsappMensagem | null;
  onCancelarResposta: () => void;
}) {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState("");
  const [agendando, setAgendando] = useState(false);
  // Janela de 24h fechada (só a Cloud API tem essa regra — a própria Meta
  // recusa o envio de texto livre). Reativo: só liga quando um envio de fato
  // é recusado com o código específico, e volta a desligar ao trocar de
  // conversa — não há como saber de antemão sem tentar.
  const [janelaFechada, setJanelaFechada] = useState(false);
  const [templateAberto, setTemplateAberto] = useState(false);
  const [gerenciadorRespostasAberto, setGerenciadorRespostasAberto] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const midiaRef = useRef<HTMLInputElement>(null);

  const sugerirResposta = useMutation({
    mutationFn: () =>
      apiFetch<{ sugestao: string }>(`/whatsapp/conversas/${conversaId}/sugerir-resposta`, {
        method: "POST",
      }),
    onSuccess: (data) => {
      setTexto(data.sugestao);
      toast.success("Sugestão de resposta gerada com sucesso pela IA!");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao gerar sugestão com IA"),
  });

  // Ajuste de estado durante a renderização (não em efeito): troca de
  // conversa é uma mudança de identidade, não um evento a sincronizar depois.
  const [conversaAnterior, setConversaAnterior] = useState(conversaId);
  if (conversaId !== conversaAnterior) {
    setConversaAnterior(conversaId);
    setJanelaFechada(false);
  }

  const invalidar = () =>
    void queryClient.invalidateQueries({
      queryKey: ["whatsapp-mensagens", conversaId],
    });

  const enviarTexto = useMutation({
    mutationFn: () =>
      apiFetch<WhatsappMensagem>(`/whatsapp/conversas/${conversaId}/mensagens`, {
        method: "POST",
        body: {
          texto,
          respondeuA: respondendo?.externoId,
        },
      }),
    onSuccess: () => {
      setTexto("");
      setJanelaFechada(false);
      onCancelarResposta();
      invalidar();
    },
    onError: (err) => {
      if (ehJanelaWhatsappFechada(err)) {
        setJanelaFechada(true);
        return;
      }
      toast.error(err instanceof ApiError ? err.message : "Falha ao enviar");
    },
  });

  const enviarArquivo = useMutation({
    mutationFn: ({ arquivo, ptt }: { arquivo: File; ptt?: boolean }) => {
      const form = new FormData();
      form.append("arquivo", arquivo);
      if (texto.trim()) form.append("legenda", texto.trim());
      if (ptt) form.append("ptt", "true");
      return apiUpload<WhatsappMensagem>(
        `/whatsapp/conversas/${conversaId}/arquivos`,
        form,
      );
    },
    onSuccess: () => {
      setTexto("");
      invalidar();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Falha ao enviar o arquivo",
      ),
  });

  const escolher = (arquivo: File | undefined) => {
    if (!arquivo) return;
    if (arquivo.size > WHATSAPP_ARQUIVO_MAX_BYTES) {
      toast.error(
        "O WhatsApp aceita no máximo 16 MB por arquivo. Este está maior.",
      );
      return;
    }
    enviarArquivo.mutate({ arquivo });
  };

  const gravacao = useGravadorDeAudio((arquivo) =>
    enviarArquivo.mutate({ arquivo, ptt: true }),
  );

  const ocupado = enviarTexto.isPending || enviarArquivo.isPending;

  return (
    <div className="border-t">
      {respondendo ? (
        <div className="flex items-start gap-2 border-b bg-muted/40 px-3 py-2 text-xs">
          <div className="min-w-0 flex-1 border-l-2 border-primary pl-2">
            <p className="font-medium">
              {respondendo.autorNome ??
                respondendo.enviadaPorNome ??
                (respondendo.direcao === "saida" ? "Atendente" : "Contato")}
            </p>
            <p className="truncate text-muted-foreground">
              {respondendo.conteudo ?? `[${respondendo.tipo}]`}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelarResposta}
            aria-label="Cancelar resposta"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
      ) : null}

      {janelaFechada ? (
        <div className="flex items-center justify-between gap-3 border-b bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          <span className="flex items-center gap-2">
            <TriangleAlert className="size-4 shrink-0" />
            A janela de 24h desta conversa expirou. Só um template aprovado
            sai a partir de agora.
          </span>
          <Button size="sm" variant="outline" onClick={() => setTemplateAberto(true)}>
            Enviar template
          </Button>
        </div>
      ) : null}

      <form
        className="flex items-center gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (texto.trim()) enviarTexto.mutate();
        }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={ocupado}
              aria-label="Anexar arquivo ou agendar mensagem"
              title="Anexar ou agendar"
            >
              <Plus className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            <DropdownMenuItem onClick={() => arquivoRef.current?.click()}>
              <FileText className="size-4" />
              Documento
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => midiaRef.current?.click()}>
              <ImageIcon className="size-4" />
              Fotos e vídeos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setGerenciadorRespostasAberto(true)}>
              <Zap className="size-4 text-amber-500" />
              Respostas rápidas (/atalhos)
            </DropdownMenuItem>
            <DropdownMenuItem
              // Agendar leva o texto já digitado: quem escreveu e percebeu que
              // é melhor mandar amanhã não deve ter que reescrever.
              onClick={() => setAgendando(true)}
            >
              <Clock className="size-4" />
              Agendar mensagem
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Dois inputs porque o filtro muda: documento aceita tudo, mídia
            restringe a imagem/vídeo e no celular abre direto a galeria. */}
        <input
          ref={arquivoRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            escolher(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={midiaRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            escolher(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <div className="relative flex-1">
          {texto.startsWith("/") ? (
            <RespostasRapidasPopover
              filtro={texto.slice(1)}
              onSelecionar={(conteudo) => setTexto(conteudo)}
              onAbrirGerenciador={() => setGerenciadorRespostasAberto(true)}
            />
          ) : null}
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={
              gravacao.gravando ? "Gravando áudio…" : "Escreva uma mensagem ou digite / para atalhos"
            }
            disabled={gravacao.gravando || ocupado}
          />
        </div>

        <Button
          type="button"
          size="icon"
          variant="outline"
          disabled={ocupado || sugerirResposta.isPending}
          onClick={() => sugerirResposta.mutate()}
          title="Sugerir resposta com IA (Copilot)"
          className="text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
        >
          {sugerirResposta.isPending ? (
            <Loader2 className="size-4 animate-spin text-amber-500" />
          ) : (
            <Sparkles className="size-4" />
          )}
        </Button>

        {gravacao.gravando ? (
          <>
            <span className="text-xs tabular-nums text-destructive">
              {gravacao.duracao}s
            </span>
            <Button
              type="button"
              size="icon"
              variant="destructive"
              onClick={gravacao.cancelar}
              title="Descartar"
            >
              <X className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              onClick={gravacao.parar}
              title="Enviar áudio"
            >
              <Square className="size-4" />
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={gravacao.iniciar}
              disabled={ocupado}
              title="Gravar áudio"
            >
              <Mic className="size-5" />
            </Button>
            <Button
              type="submit"
              size="icon"
              disabled={!texto.trim() || ocupado}
              title="Enviar mensagem"
            >
              <Send className="size-4" />
            </Button>
          </>
        )}
      </form>

      {enviarArquivo.isPending ? (
        <p className="flex items-center gap-2 px-3 pb-2 text-xs text-muted-foreground">
          <Paperclip className="size-3" />
          Enviando arquivo…
        </p>
      ) : null}

      <RespostasRapidasDialog
        aberto={gerenciadorRespostasAberto}
        onOpenChange={setGerenciadorRespostasAberto}
      />

      <AgendarMensagemDialog
        conversaId={conversaId}
        textoInicial={texto}
        aberto={agendando}
        onOpenChange={setAgendando}
        onAgendada={() => setTexto("")}
      />

      <TemplateDialog
        conversaId={conversaId}
        aberto={templateAberto}
        onOpenChange={setTemplateAberto}
        onEnviado={() => {
          setJanelaFechada(false);
          invalidar();
        }}
      />
    </div>
  );
}

/** Quantas variáveis (`{{1}}`, `{{2}}`...) o corpo do template pede. */
function contarParametros(componentes: unknown): number {
  const body = Array.isArray(componentes)
    ? (componentes as { type?: string; text?: string }[]).find(
        (c) => c.type?.toUpperCase() === "BODY",
      )
    : null;
  const texto = body?.text ?? "";
  const casadas = texto.match(/\{\{\d+\}\}/g) ?? [];
  return new Set(casadas).size;
}

/**
 * Seletor de template pré-aprovado — o único jeito de mandar mensagem quando
 * a janela de 24h da Cloud API fechou (`WHATSAPP_JANELA_FECHADA`). Fora dela,
 * a própria Meta recusa texto livre.
 */
function TemplateDialog({
  conversaId,
  aberto,
  onOpenChange,
  onEnviado,
}: {
  conversaId: string;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  onEnviado: () => void;
}) {
  const [templateId, setTemplateId] = useState<string>("");
  const [parametros, setParametros] = useState<string[]>([]);

  const { data: templates = [] } = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => apiFetch<WhatsappTemplate[]>("/whatsapp/config/templates"),
    enabled: aberto,
  });
  const aprovados = templates.filter((t) => t.status === "APPROVED");
  const selecionado = aprovados.find((t) => t.id === templateId) ?? null;
  const totalParametros = selecionado
    ? contarParametros(selecionado.componentes)
    : 0;

  const enviar = useMutation({
    mutationFn: () =>
      apiFetch(`/whatsapp/conversas/${conversaId}/mensagens/template`, {
        method: "POST",
        body: { templateId, parametros },
      }),
    onSuccess: () => {
      toast.success("Template enviado");
      setTemplateId("");
      setParametros([]);
      onOpenChange(false);
      onEnviado();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Falha ao enviar o template",
      ),
  });

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar template</DialogTitle>
          <DialogDescription>
            Fora da janela de 24h, a Meta só aceita mensagem por template
            pré-aprovado. As variáveis do corpo entram na ordem abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Select
            value={templateId}
            onValueChange={(v) => {
              setTemplateId(v);
              setParametros([]);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Escolha um template" />
            </SelectTrigger>
            <SelectContent>
              {aprovados.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nome} ({t.idioma})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {aprovados.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum template aprovado sincronizado. Sincronize em
              Administração &gt; WhatsApp &gt; API Oficial.
            </p>
          ) : null}

          {Array.from({ length: totalParametros }).map((_, i) => (
            <Input
              key={i}
              placeholder={`Variável {{${i + 1}}}`}
              value={parametros[i] ?? ""}
              onChange={(e) => {
                const proximo = [...parametros];
                proximo[i] = e.target.value;
                setParametros(proximo);
              }}
            />
          ))}
        </div>

        <DialogFooter>
          <Button
            onClick={() => enviar.mutate()}
            disabled={!templateId || enviar.isPending}
          >
            {enviar.isPending ? "Enviando..." : "Enviar template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Agendar uma mensagem e ver as que já estão na fila.
 *
 * As duas coisas no mesmo lugar de propósito: agendar sem enxergar o que já
 * está agendado leva a mandar a mesma cobrança duas vezes.
 */
function AgendarMensagemDialog({
  conversaId,
  textoInicial,
  aberto,
  onOpenChange,
  onAgendada,
}: {
  conversaId: string;
  textoInicial: string;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  onAgendada: () => void;
}) {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState(textoInicial);
  const [quando, setQuando] = useState("");

  const chave = ["whatsapp-agendamentos", conversaId];
  const agendadasQuery = useQuery({
    queryKey: chave,
    queryFn: () =>
      apiFetch<WhatsappMensagemAgendada[]>(
        `/whatsapp/conversas/${conversaId}/agendamentos`,
      ),
    enabled: aberto,
  });

  const agendar = useMutation({
    mutationFn: () =>
      apiFetch(`/whatsapp/conversas/${conversaId}/agendamentos`, {
        method: "POST",
        // `datetime-local` não tem fuso: o navegador monta a data na hora
        // local de quem digitou, que é o que o vendedor quis dizer.
        body: { texto, enviarEm: new Date(quando).toISOString() },
      }),
    onSuccess: () => {
      toast.success("Mensagem agendada");
      setQuando("");
      setTexto("");
      onAgendada();
      void queryClient.invalidateQueries({ queryKey: chave });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao agendar"),
  });

  const cancelar = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/whatsapp/conversas/${conversaId}/agendamentos/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast.success("Agendamento cancelado");
      void queryClient.invalidateQueries({ queryKey: chave });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao cancelar"),
  });

  const agendadas = agendadasQuery.data ?? [];

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agendar mensagem</DialogTitle>
          <DialogDescription>
            O texto sai sozinho na hora marcada. Se o seu WhatsApp estiver
            desconectado nesse momento, o envio falha e o aviso aparece aqui.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            autoFocus
            placeholder="Mensagem"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <Input
            type="datetime-local"
            value={quando}
            onChange={(e) => setQuando(e.target.value)}
          />

          {agendadas.length > 0 ? (
            <div className="space-y-1 rounded-md border p-2">
              <p className="text-xs font-medium text-muted-foreground">
                Já agendadas
              </p>
              {agendadas.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate">{a.texto}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(a.enviarEm).toLocaleString("pt-BR")}
                      {a.status === "erro" ? (
                        <span className="text-destructive">
                          {" "}
                          — falhou: {a.erro}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <button
                    type="button"
                    title="Cancelar"
                    disabled={cancelar.isPending}
                    onClick={() => cancelar.mutate(a.id)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            onClick={() => agendar.mutate()}
            disabled={!texto.trim() || !quando || agendar.isPending}
          >
            {agendar.isPending ? "Agendando…" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Gravação de áudio pelo navegador.
 *
 * O formato depende do navegador (webm/opus no Chrome, mp4 no Safari) — o
 * MIME real é o que o `MediaRecorder` devolver, porque o WhatsApp recusa
 * áudio anunciado com o tipo errado.
 */
function useGravadorDeAudio(aoTerminar: (arquivo: File) => void) {
  const [gravando, setGravando] = useState(false);
  const [duracao, setDuracao] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const descartar = useRef(false);

  useEffect(() => {
    if (!gravando) return;
    const timer = setInterval(() => setDuracao((d) => d + 1), 1000);
    return () => clearInterval(timer);
  }, [gravando]);

  const encerrarMicrofone = () => {
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
    recorder.current = null;
  };

  const iniciar = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const gravador = new MediaRecorder(stream);
      pedacos.current = [];
      descartar.current = false;

      gravador.ondataavailable = (e) => {
        if (e.data.size > 0) pedacos.current.push(e.data);
      };
      gravador.onstop = () => {
        const tipo = gravador.mimeType || "audio/webm";
        const blob = new Blob(pedacos.current, { type: tipo });
        encerrarMicrofone();
        setGravando(false);
        setDuracao(0);
        if (descartar.current || blob.size === 0) return;
        const extensao = tipo.includes("mp4") ? "m4a" : "webm";
        aoTerminar(new File([blob], `audio.${extensao}`, { type: tipo }));
      };

      gravador.start();
      recorder.current = gravador;
      setDuracao(0);
      setGravando(true);
    } catch {
      // Sem permissão de microfone não há o que fazer além de explicar.
      toast.error(
        "Não foi possível acessar o microfone. Libere a permissão no navegador.",
      );
    }
  };

  return {
    gravando,
    duracao,
    iniciar,
    parar: () => recorder.current?.stop(),
    cancelar: () => {
      descartar.current = true;
      recorder.current?.stop();
    },
  };
}
