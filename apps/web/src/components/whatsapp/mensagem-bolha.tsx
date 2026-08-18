"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  CheckCheck,
  Download,
  FileText,
  Reply,
  SmilePlus,
} from "lucide-react";
import {
  WHATSAPP_REACOES_RAPIDAS,
  type WhatsappMensagem,
} from "@plataforma/contracts";
import { API_ORIGIN, ApiError, apiFetch } from "@/lib/api-client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Uma mensagem no rolo da conversa.
 *
 * Mídia é renderizada pelo tipo, como no WhatsApp: imagem aparece, áudio toca
 * no player, vídeo tem controles e documento vira um item para baixar — um
 * anexo que só mostra o nome do arquivo obriga o vendedor a abrir o celular,
 * que é exatamente o que esta tela existe para evitar.
 */
export function MensagemBolha({
  mensagem,
  citada,
  onResponder,
  conversaId,
}: {
  mensagem: WhatsappMensagem;
  citada: WhatsappMensagem | null;
  onResponder: (m: WhatsappMensagem) => void;
  conversaId: string;
}) {
  const minha = mensagem.direcao === "saida";
  // Os arquivos são servidos pela API, que está em outra origem que o front.
  const url = mensagem.arquivoUrl ? `${API_ORIGIN}${mensagem.arquivoUrl}` : null;
  const reacoes = mensagem.reacoes ?? [];
  const minhaReacao = reacoes.find((r) => r.deQuem === "nos")?.emoji ?? null;

  return (
    <div className={`group flex items-end gap-1 ${minha ? "justify-end" : ""}`}>
      {minha ? (
        <BarraDeAcoes
          mensagem={mensagem}
          conversaId={conversaId}
          minhaReacao={minhaReacao}
          onResponder={onResponder}
        />
      ) : null}

      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
          minha ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {citada ? (
          <div
            className={`mb-1 border-l-2 pl-2 text-xs ${
              minha
                ? "border-primary-foreground/50 text-primary-foreground/80"
                : "border-primary text-muted-foreground"
            }`}
          >
            <p className="truncate">
              {citada.conteudo ?? `[${citada.tipo}]`}
            </p>
          </div>
        ) : null}

        <Conteudo mensagem={mensagem} url={url} />

        <div className="flex items-center justify-end gap-1 pt-1 text-[10px] opacity-70">
          {new Date(mensagem.criadaEm).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {minha ? <Recibo status={mensagem.statusEntrega} /> : null}
        </div>

        {reacoes.length ? (
          // Meio fora da bolha, como no WhatsApp: a reação pertence à mensagem
          // mas não é conteúdo dela.
          <div
            className={`-mb-4 -mt-1 flex w-fit gap-0.5 rounded-full border bg-background px-1.5 py-0.5 text-xs shadow-sm ${
              minha ? "ml-auto" : ""
            }`}
          >
            {reacoes.map((r) => (
              <span key={r.deQuem} title={r.deQuem === "nos" ? "Você" : "Cliente"}>
                {r.emoji}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {!minha ? (
        <BarraDeAcoes
          mensagem={mensagem}
          conversaId={conversaId}
          minhaReacao={minhaReacao}
          onResponder={onResponder}
        />
      ) : null}
    </div>
  );
}

function Conteudo({
  mensagem,
  url,
}: {
  mensagem: WhatsappMensagem;
  url: string | null;
}) {
  // Mídia ainda baixando: a mensagem chega antes do arquivo, que vem num
  // segundo passo (só é baixado depois de a plataforma decidir que grava).
  if (!url && mensagem.tipo !== "texto") {
    return (
      <p className="italic opacity-80">
        {mensagem.conteudo ?? `[${mensagem.tipo}] recebendo arquivo…`}
      </p>
    );
  }

  if (mensagem.tipo === "imagem" && url) {
    return (
      <div className="space-y-1">
        <a href={url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={mensagem.conteudo ?? "Imagem recebida"}
            className="max-h-72 rounded"
          />
        </a>
        {mensagem.conteudo ? <p>{mensagem.conteudo}</p> : null}
      </div>
    );
  }

  if (mensagem.tipo === "video" && url) {
    return (
      <div className="space-y-1">
        <video src={url} controls className="max-h-72 rounded" />
        {mensagem.conteudo ? <p>{mensagem.conteudo}</p> : null}
      </div>
    );
  }

  if (mensagem.tipo === "audio" && url) {
    return <audio src={url} controls className="max-w-full" />;
  }

  if (mensagem.tipo === "documento" && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 underline-offset-2 hover:underline"
      >
        <FileText className="size-4 shrink-0" />
        <span className="truncate">{mensagem.arquivoNome ?? "documento"}</span>
        <Download className="size-3.5 shrink-0 opacity-70" />
      </a>
    );
  }

  return <p className="whitespace-pre-wrap">{mensagem.conteudo ?? `[${mensagem.tipo}]`}</p>;
}

/** ✓ enviada, ✓✓ entregue, ✓✓ azul lida — a convenção que todo mundo já lê. */
function Recibo({ status }: { status: WhatsappMensagem["statusEntrega"] }) {
  if (status === "erro") return <span className="text-destructive">!</span>;
  if (status === "lida") return <CheckCheck className="size-3 text-sky-300" />;
  if (status === "entregue") return <CheckCheck className="size-3" />;
  return <Check className="size-3" />;
}

/**
 * Responder e reagir — aparecem ao passar o mouse na mensagem, como no
 * WhatsApp. Ficam do lado de fora da bolha para não competir com o conteúdo.
 */
function BarraDeAcoes({
  mensagem,
  conversaId,
  minhaReacao,
  onResponder,
}: {
  mensagem: WhatsappMensagem;
  conversaId: string;
  minhaReacao: string | null;
  onResponder: (m: WhatsappMensagem) => void;
}) {
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);

  const reagir = useMutation({
    mutationFn: (emoji: string) =>
      apiFetch(
        `/whatsapp/conversas/${conversaId}/mensagens/${mensagem.id}/reacao`,
        { method: "POST", body: { emoji } },
      ),
    onSuccess: () => {
      setAberto(false);
      void queryClient.invalidateQueries({
        queryKey: ["whatsapp-mensagens", conversaId],
      });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao reagir"),
  });

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onResponder(mensagem)}
        title="Responder"
        className="opacity-0 transition group-hover:opacity-60 hover:!opacity-100"
      >
        <Reply className="size-4" />
      </button>

      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Reagir"
            className={`transition ${
              minhaReacao
                ? "opacity-60 hover:opacity-100"
                : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
            }`}
          >
            <SmilePlus className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="flex w-auto gap-1 p-1" align="center">
          {WHATSAPP_REACOES_RAPIDAS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              disabled={reagir.isPending}
              // Clicar no emoji que já está posto desfaz a reação: string
              // vazia é como o WhatsApp remove.
              onClick={() => reagir.mutate(emoji === minhaReacao ? "" : emoji)}
              className={`rounded p-1 text-lg transition hover:bg-muted ${
                emoji === minhaReacao ? "bg-muted" : ""
              }`}
            >
              {emoji}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
