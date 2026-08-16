"use client";

import { Check, CheckCheck, Download, FileText, Reply } from "lucide-react";
import type { WhatsappMensagem } from "@plataforma/contracts";
import { API_ORIGIN } from "@/lib/api-client";

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
}: {
  mensagem: WhatsappMensagem;
  citada: WhatsappMensagem | null;
  onResponder: (m: WhatsappMensagem) => void;
}) {
  const minha = mensagem.direcao === "saida";
  // Os arquivos são servidos pela API, que está em outra origem que o front.
  const url = mensagem.arquivoUrl ? `${API_ORIGIN}${mensagem.arquivoUrl}` : null;

  return (
    <div className={`group flex items-end gap-1 ${minha ? "justify-end" : ""}`}>
      {minha ? <BotaoResponder mensagem={mensagem} onResponder={onResponder} /> : null}

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
      </div>

      {!minha ? <BotaoResponder mensagem={mensagem} onResponder={onResponder} /> : null}
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

function BotaoResponder({
  mensagem,
  onResponder,
}: {
  mensagem: WhatsappMensagem;
  onResponder: (m: WhatsappMensagem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onResponder(mensagem)}
      title="Responder"
      className="opacity-0 transition group-hover:opacity-60 hover:!opacity-100"
    >
      <Reply className="size-4" />
    </button>
  );
}
