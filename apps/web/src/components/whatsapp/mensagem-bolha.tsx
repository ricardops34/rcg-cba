"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Ban,
  BarChart3,
  Check,
  CheckCheck,
  Copy,
  Download,
  ExternalLink,
  FileText,
  ListChecks,
  MapPin,
  MousePointerClick,
  Pencil,
  Phone,
  Reply,
  SmilePlus,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  WHATSAPP_EDICAO_LIMITE_MS,
  WHATSAPP_REACOES_RAPIDAS,
  whatsappInterativoSchema,
  type WhatsappBotao,
  type WhatsappInterativo,
  type WhatsappMensagem,
  type WhatsappVotoEnquete,
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
  autorNome,
  citada,
  onResponder,
  conversaId,
  somenteLeitura,
}: {
  mensagem: WhatsappMensagem;
  autorNome?: string | null;
  citada: WhatsappMensagem | null;
  onResponder?: (m: WhatsappMensagem) => void;
  conversaId: string;
  somenteLeitura?: boolean;
}) {
  const minha = mensagem.direcao === "saida";
  // Os arquivos são servidos pela API, que está em outra origem que o front.
  const url = mensagem.arquivoUrl ? `${API_ORIGIN}${mensagem.arquivoUrl}` : null;
  const reacoes = mensagem.reacoes ?? [];
  const minhaReacao = reacoes.find((r) => r.deQuem === "nos")?.emoji ?? null;

  // Resposta rápida a botão de mensagem recebida: vai como texto citando a
  // mensagem (ver `BotaoDaMensagem`). Só no Atendimento, onde se responde —
  // no Gerencial (`somenteLeitura`) o botão é só ilustração.
  const queryClient = useQueryClient();
  const responderBotao = useMutation({
    mutationFn: (texto: string) =>
      apiFetch(`/whatsapp/conversas/${conversaId}/mensagens`, {
        method: "POST",
        body: { texto, respondeuA: mensagem.externoId, respostaBotao: true },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-mensagens"] });
      toast.success("Resposta enviada");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao responder"),
  });
  const onResponderBotao =
    !minha && !somenteLeitura && !responderBotao.isPending
      ? (texto: string) => responderBotao.mutate(texto)
      : undefined;

  return (
    <div className={`group flex items-end gap-1 ${minha ? "justify-end" : ""}`}>
      {minha && !somenteLeitura && onResponder ? (
        <BarraDeAcoes
          mensagem={mensagem}
          conversaId={conversaId}
          minhaReacao={minhaReacao}
          onResponder={onResponder}
        />
      ) : null}

      <div
        className={`max-w-[75%] px-3.5 py-2 text-sm shadow-xs transition-all ${
          minha
            ? "rounded-2xl rounded-tr-xs bg-[#D9FDD3] dark:bg-[#005C4B] text-[#111B21] dark:text-[#E9EDEF] shadow-black/5"
            : "rounded-2xl rounded-tl-xs bg-white dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF] shadow-black/5 border border-border/40 dark:border-transparent"
        }`}
      >
        {citada ? (
          <div
            className={`mb-1.5 border-l-3 pl-2.5 text-xs py-1 rounded-r ${
              minha
                ? "border-emerald-700 bg-black/5 dark:bg-black/25 text-[#111B21] dark:text-[#E9EDEF]"
                : "border-emerald-600 bg-muted/60 dark:bg-black/20 text-[#111B21] dark:text-[#E9EDEF]"
            }`}
          >
            <p className="truncate font-medium">
              {citada.conteudo ?? `[${citada.tipo}]`}
            </p>
          </div>
        ) : null}

        {autorNome ? (
          <p
            className={`mb-1 text-[11px] font-semibold tracking-wide ${
              minha ? "text-emerald-700 dark:text-emerald-300" : "text-emerald-600 dark:text-emerald-400"
            }`}
          >
            {autorNome}
          </p>
        ) : null}

        {mensagem.apagadaEm ? (
          // Apagada para todos no celular. O conteúdo continua aqui, riscado:
          // o histórico da plataforma é permanente e é auditado no Gerencial.
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-xs italic opacity-70">
              <Ban className="size-3.5" />
              {minha ? "Você apagou esta mensagem no celular" : "O cliente apagou esta mensagem"}
            </p>
            <div className="line-through opacity-60">
              <Conteudo mensagem={mensagem} url={url} onResponderBotao={onResponderBotao} />
            </div>
          </div>
        ) : (
          <Conteudo mensagem={mensagem} url={url} onResponderBotao={onResponderBotao} />
        )}

        <div className="flex items-center justify-end gap-1 pt-1 text-[10px] text-[#667781] dark:text-[#8696A0]">
          {mensagem.editadaEm ? (
            <span
              className="italic"
              title={mensagem.conteudoOriginal ? `Antes: ${mensagem.conteudoOriginal}` : undefined}
            >
              editada ·
            </span>
          ) : null}
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

      {!minha && !somenteLeitura && onResponder ? (
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
  onResponderBotao,
}: {
  mensagem: WhatsappMensagem;
  url: string | null;
  onResponderBotao?: (texto: string) => void;
}) {
  if (
    mensagem.tipo === "texto" &&
    mensagem.conteudo &&
    (mensagem.conteudo.startsWith("*Últimas notas fiscais*") ||
      mensagem.conteudo.startsWith("*Títulos em aberto*"))
  ) {
    return <ResumoComercial texto={mensagem.conteudo} />;
  }

  // Interativos da Evolution GO: desenhados a partir do conteúdo estruturado.
  // Sem ele (mensagem recebida do celular, por exemplo), cai no resumo em
  // texto, que `conteudo` sempre tem.
  const interativo = whatsappInterativoSchema.safeParse(mensagem.interativo);
  if (interativo.success) {
    return (
      <ConteudoInterativo
        m={interativo.data}
        votos={(mensagem.enqueteVotos as WhatsappVotoEnquete[] | null | undefined) ?? []}
        onResponderBotao={onResponderBotao}
      />
    );
  }
  if (mensagem.tipo === "resposta") {
    return (
      <p className="flex items-center gap-1.5">
        <MousePointerClick className="size-3.5 shrink-0 opacity-70" />
        <span className="whitespace-pre-wrap">{mensagem.conteudo}</span>
      </p>
    );
  }
  if (TIPOS_SEM_ARQUIVO.has(mensagem.tipo)) {
    return <p className="whitespace-pre-wrap">{mensagem.conteudo ?? `[${mensagem.tipo}]`}</p>;
  }

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

/** Tipos que nunca têm arquivo — não podem cair no "recebendo arquivo…". */
const TIPOS_SEM_ARQUIVO = new Set<WhatsappMensagem["tipo"]>([
  "localizacao",
  "contato",
  "botoes",
  "lista",
  "enquete",
  "link",
  "outro",
]);

/**
 * Como o cliente vê a mensagem interativa — sem os botões funcionarem aqui:
 * quem toca é ele, no celular. O clique volta como mensagem `resposta`.
 */
/**
 * Um botão de mensagem interativa.
 *
 * Link, ligação e cópia funcionam em qualquer lugar — não falam com ninguém.
 * Resposta rápida só existe na mensagem **recebida** e para quem pode
 * responder (`onResponder`): manda o texto do botão citando a mensagem. A
 * Evolution GO 0.7.2 não tem rota para enviar o "toque no botão" em si, então
 * vai como texto — o que a maioria dos robôs de empresa aceita. Na mensagem
 * que saiu daqui, quem toca é o cliente: o botão é só ilustração.
 */
function BotaoDaMensagem({
  botao,
  onResponder,
}: {
  botao: WhatsappBotao;
  onResponder?: (texto: string) => void;
}) {
  const estilo =
    "flex w-full items-center justify-center gap-1.5 rounded py-0.5 text-center text-[13px] font-medium text-sky-700 dark:text-sky-300";
  const ativo = `${estilo} cursor-pointer hover:bg-black/5 dark:hover:bg-white/10`;

  switch (botao.tipo) {
    case "url":
      return (
        <a href={botao.url} target="_blank" rel="noreferrer" className={ativo}>
          <ExternalLink className="size-3.5" /> {botao.texto}
        </a>
      );
    case "ligar":
      return (
        <a href={`tel:${botao.telefone}`} className={ativo}>
          <Phone className="size-3.5" /> {botao.texto}
        </a>
      );
    case "copiar":
    case "pix": {
      const valor = botao.tipo === "copiar" ? botao.codigo : botao.chave;
      return (
        <button
          type="button"
          className={ativo}
          title="Copiar"
          onClick={() =>
            void navigator.clipboard
              .writeText(valor)
              .then(() => toast.success("Copiado"))
              .catch(() => toast.error("Não foi possível copiar"))
          }
        >
          <Copy className="size-3.5" />
          {botao.tipo === "pix"
            ? `PIX — ${botao.nome} (${botao.tipoChave.toUpperCase()} ${botao.chave})`
            : botao.texto}
        </button>
      );
    }
    case "resposta":
      return onResponder ? (
        <button
          type="button"
          className={ativo}
          title="Responder com esta opção"
          onClick={() => onResponder(botao.texto)}
        >
          <Reply className="size-3.5" /> {botao.texto}
        </button>
      ) : (
        <p className={estilo}>{botao.texto}</p>
      );
  }
}

function ConteudoInterativo({
  m,
  votos,
  onResponderBotao,
}: {
  m: WhatsappInterativo;
  /** Só na enquete: quem votou em quê, já em texto. */
  votos: WhatsappVotoEnquete[];
  /** Presente só na mensagem recebida, para quem pode responder. */
  onResponderBotao?: (texto: string) => void;
}) {
  switch (m.tipo) {
    case "botoes":
      return (
        <div className="space-y-1.5">
          {m.titulo ? <p className="font-semibold">{m.titulo}</p> : null}
          <p className="whitespace-pre-wrap">{m.texto}</p>
          {m.rodape ? <p className="text-xs opacity-70">{m.rodape}</p> : null}
          <div className="space-y-1 border-t border-black/10 pt-1.5 dark:border-white/10">
            {m.botoes.map((b, i) => (
              <BotaoDaMensagem key={i} botao={b} onResponder={onResponderBotao} />
            ))}
          </div>
        </div>
      );
    case "lista":
      return (
        <div className="space-y-1.5">
          {m.titulo ? <p className="font-semibold">{m.titulo}</p> : null}
          <p className="whitespace-pre-wrap">{m.texto}</p>
          {m.rodape ? <p className="text-xs opacity-70">{m.rodape}</p> : null}
          <details className="border-t border-black/10 pt-1.5 dark:border-white/10">
            <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 text-[13px] font-medium text-sky-700 dark:text-sky-300">
              <ListChecks className="size-3.5" /> {m.textoBotao}
            </summary>
            {m.secoes.map((s, i) => (
              <div key={i} className="mt-1.5">
                <p className="text-[11px] font-semibold uppercase opacity-60">{s.titulo}</p>
                {s.linhas.map((l, j) => (
                  <div key={j} className="py-0.5">
                    <p>{l.titulo}</p>
                    {l.descricao ? <p className="text-xs opacity-70">{l.descricao}</p> : null}
                  </div>
                ))}
              </div>
            ))}
          </details>
        </div>
      );
    case "enquete":
      return (
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 font-semibold">
            <BarChart3 className="size-4" /> {m.pergunta}
          </p>
          <p className="text-xs opacity-70">
            {m.maxRespostas === 1 ? "Escolha uma opção" : "Escolha uma ou mais opções"}
          </p>
          {m.opcoes.map((o) => {
            const quem = votos.filter((v) => v.opcoes.includes(o));
            return (
              <p
                key={o}
                className="flex items-center justify-between gap-2 rounded border border-black/10 px-2 py-1 dark:border-white/10"
                title={quem.map((v) => v.nome ?? v.telefone ?? "?").join(", ") || undefined}
              >
                <span>{o}</span>
                {votos.length ? (
                  <span className="text-xs font-semibold tabular-nums opacity-70">{quem.length}</span>
                ) : null}
              </p>
            );
          })}
          {votos.length ? (
            <p className="text-[11px] opacity-60">
              {votos.length} {votos.length === 1 ? "voto" : "votos"}
            </p>
          ) : null}
        </div>
      );
    case "localizacao":
      return (
        <a
          href={`https://maps.google.com/?q=${m.latitude},${m.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-start gap-2 hover:underline"
        >
          <MapPin className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="block font-medium">{m.nome}</span>
            <span className="block text-xs opacity-70">{m.endereco}</span>
          </span>
        </a>
      );
    case "contato":
      return (
        <p className="flex items-start gap-2">
          <UserRound className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="block font-medium">{m.nome}</span>
            <span className="block text-xs opacity-70">
              {m.telefone}
              {m.empresa ? ` · ${m.empresa}` : ""}
            </span>
          </span>
        </p>
      );
    case "link":
      return <p className="whitespace-pre-wrap break-words">{m.texto}</p>;
  }
}

function ResumoComercial({ texto }: { texto: string }) {
  const linhas = texto.split("\n").map((linha) => linha.trim()).filter(Boolean);
  const titulo = linhas[0]?.replaceAll("*", "") ?? "Resumo comercial";
  const itens = linhas.filter((linha) => linha.startsWith("•"));
  const total = linhas.find((linha) => linha.startsWith("Total:"));

  return (
    <div className="min-w-56 space-y-2">
      <div className="flex items-center gap-2">
        <FileText className="size-4 shrink-0" />
        <div>
          <p className="font-semibold">{titulo}</p>
          <p className="text-xs opacity-75">
            {itens.length} {itens.length === 1 ? "registro" : "registros"}
            {total ? ` · ${total}` : ""}
          </p>
        </div>
      </div>
      <details className="group rounded-md bg-black/5 px-2 py-1 dark:bg-white/10">
        <summary className="cursor-pointer text-xs font-medium">
          Ver detalhes
        </summary>
        <div className="mt-2 space-y-1 border-t border-current/15 pt-2 text-xs">
          {itens.map((item, indice) => (
            <p key={`${indice}-${item}`} className="whitespace-pre-wrap">
              {item.replace(/^•\s*/, "")}
            </p>
          ))}
        </div>
      </details>
    </div>
  );
}

/** ✓ enviada, ✓✓ entregue, ✓✓ azul lida — a convenção que todo mundo já lê. */
function Recibo({ status }: { status: WhatsappMensagem["statusEntrega"] }) {
  if (status === "erro") return <span className="text-destructive font-bold">!</span>;
  if (status === "lida") return <CheckCheck className="size-3.5 text-[#53BDEB]" />;
  if (status === "entregue") return <CheckCheck className="size-3.5 text-[#8696A0]" />;
  return <Check className="size-3.5 text-[#8696A0]" />;
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
  const [editando, setEditando] = useState(false);
  const [confirmandoApagar, setConfirmandoApagar] = useState(false);
  const [textoEditado, setTextoEditado] = useState(mensagem.conteudo ?? "");
  // Relógio lido uma vez, na montagem: a regra de pureza do React não deixa
  // ler a hora durante a renderização. Se o prazo vencer com a tela aberta,
  // a API recusa com a mensagem dos 15 minutos.
  const [montadaEm] = useState(() => Date.now());

  // Prefixo só com o nome: a chave da tela inclui o empresaId antes do
  // conversaId, e o prefixo antigo (["whatsapp-mensagens", conversaId]) não
  // casava — a reação só aparecia no próximo ciclo de atualização.
  const atualizar = () =>
    void queryClient.invalidateQueries({ queryKey: ["whatsapp-mensagens"] });

  const reagir = useMutation({
    mutationFn: (emoji: string) =>
      apiFetch(
        `/whatsapp/conversas/${conversaId}/mensagens/${mensagem.id}/reacao`,
        { method: "POST", body: { emoji } },
      ),
    onSuccess: () => {
      setAberto(false);
      atualizar();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao reagir"),
  });

  const editar = useMutation({
    mutationFn: () =>
      apiFetch(`/whatsapp/conversas/${conversaId}/mensagens/${mensagem.id}`, {
        method: "PATCH",
        body: { texto: textoEditado },
      }),
    onSuccess: () => {
      setEditando(false);
      atualizar();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao editar"),
  });

  const apagar = useMutation({
    mutationFn: () =>
      apiFetch(`/whatsapp/conversas/${conversaId}/mensagens/${mensagem.id}/apagar`, {
        method: "POST",
      }),
    onSuccess: () => {
      setConfirmandoApagar(false);
      atualizar();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao apagar"),
  });

  const minha = mensagem.direcao === "saida";
  // As mesmas regras da API: só texto próprio e só nos 15 minutos que o
  // WhatsApp aceita — fora disso o botão nem aparece.
  const podeEditar =
    minha &&
    mensagem.tipo === "texto" &&
    !mensagem.apagadaEm &&
    montadaEm - new Date(mensagem.criadaEm).getTime() < WHATSAPP_EDICAO_LIMITE_MS;
  const podeApagar = minha && !mensagem.apagadaEm;

  return (
    <div className="flex items-center gap-1">
      {podeEditar ? (
        <Popover open={editando} onOpenChange={setEditando}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Editar"
              className="opacity-0 transition group-hover:opacity-60 hover:!opacity-100"
            >
              <Pencil className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-2 p-2" align="end">
            <textarea
              value={textoEditado}
              onChange={(e) => setTextoEditado(e.target.value)}
              rows={3}
              maxLength={4096}
              className="w-full resize-none rounded border bg-background p-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditando(false)}
                className="rounded px-2 py-1 text-xs hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!textoEditado.trim() || editar.isPending}
                onClick={() => editar.mutate()}
                className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
              >
                {editar.isPending ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}

      {podeApagar ? (
        <Popover open={confirmandoApagar} onOpenChange={setConfirmandoApagar}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Apagar para todos"
              className="opacity-0 transition group-hover:opacity-60 hover:!opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 space-y-2 p-3 text-sm" align="end">
            <p>Apagar para todos?</p>
            <p className="text-xs text-muted-foreground">
              Some do celular do cliente. Aqui ela continua no histórico, marcada como apagada.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmandoApagar(false)}
                className="rounded px-2 py-1 text-xs hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={apagar.isPending}
                onClick={() => apagar.mutate()}
                className="rounded bg-destructive px-2 py-1 text-xs text-white disabled:opacity-50"
              >
                {apagar.isPending ? "Apagando…" : "Apagar"}
              </button>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
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
