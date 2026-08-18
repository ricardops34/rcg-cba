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
  X,
} from "lucide-react";
import {
  WHATSAPP_ARQUIVO_MAX_BYTES,
  type WhatsappMensagem,
  type WhatsappMensagemAgendada,
} from "@plataforma/contracts";
import { ApiError, apiFetch, apiUpload } from "@/lib/api-client";
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
  const arquivoRef = useRef<HTMLInputElement>(null);
  const midiaRef = useRef<HTMLInputElement>(null);

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
      onCancelarResposta();
      invalidar();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao enviar"),
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
              {respondendo.direcao === "saida" ? "Você" : "Cliente"}
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

      <form
        className="flex items-center gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (texto.trim()) enviarTexto.mutate();
        }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" disabled={ocupado}>
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

        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={
            gravacao.gravando ? "Gravando áudio…" : "Escreva a mensagem"
          }
          disabled={gravacao.gravando || ocupado}
        />

        {texto.trim() ? (
          <Button type="submit" size="icon" disabled={ocupado}>
            <Send className="size-4" />
          </Button>
        ) : gravacao.gravando ? (
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
        )}
      </form>

      {enviarArquivo.isPending ? (
        <p className="flex items-center gap-2 px-3 pb-2 text-xs text-muted-foreground">
          <Paperclip className="size-3" />
          Enviando arquivo…
        </p>
      ) : null}

      <AgendarMensagemDialog
        conversaId={conversaId}
        textoInicial={texto}
        aberto={agendando}
        onOpenChange={setAgendando}
        onAgendada={() => setTexto("")}
      />
    </div>
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
