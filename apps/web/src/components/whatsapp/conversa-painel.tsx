"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarCheck2,
  Link2,
  Loader2,
  Lock,
  MessageCircle,
  MessageSquare,
  MessageSquarePlus,
  MoreVertical,
  PanelLeftOpen,
  Plug,
  RefreshCw,
  StickyNote,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import type {
  WhatsappConversa,
  WhatsappEventoAtendimento,
  WhatsappMensagem,
} from "@plataforma/contracts";
import { ApiError, apiFetch, assetUrl } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { avatarColorClass, initials } from "@/lib/avatar-color";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Composer } from "@/components/whatsapp/composer";
import { MensagemBolha } from "@/components/whatsapp/mensagem-bolha";
import { AcoesCliente } from "@/components/whatsapp/acoes-cliente";

/**
 * Uma conversa de WhatsApp: cabeçalho, rolo de mensagens e o compositor com
 * as ações do cliente.
 *
 * Mora fora da tela de Atendimento porque também abre na janela flutuante da
 * Posição de Cliente (`AtendimentoClienteJanela`). Quem decide **qual**
 * conversa abre é quem usa; o que ela alcança é a API que decide.
 */

export function nomeDaConversa(conversa: WhatsappConversa) {
  return (
    conversa.contato.clienteRazaoSocial ??
    conversa.contato.nomeExibicao ??
    conversa.contato.telefoneNormalizado ??
    "Contato"
  );
}

function ConversaVazia({
  onNovaConversa,
  sessaoNumero,
}: {
  onNovaConversa?: () => void;
  sessaoNumero?: string | null;
}) {
  return (
    <div
      data-tour="atendimento-mensagens"
      className="flex h-full min-h-0 flex-col items-center justify-center bg-[#F0F2F5]/70 dark:bg-[#111B21] p-8 text-center select-none"
    >
      <div className="relative mb-6">
        <div className="flex size-20 items-center justify-center rounded-full bg-emerald-500/10 text-[#00A884] ring-8 ring-emerald-500/5">
          <MessageCircle className="size-10" />
        </div>
        <span className="absolute bottom-0 right-0 flex size-6 items-center justify-center rounded-full bg-[#00A884] text-white shadow-xs">
          <Plug className="size-3" />
        </span>
      </div>

      <h3 className="text-xl font-bold tracking-tight text-foreground">
        WhatsApp Web
      </h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
        Envie e receba mensagens diretamente pela plataforma comercial. As conversas com clientes vinculados ficam integradas ao ERP e disponíveis para toda a equipe.
      </p>

      {sessaoNumero ? (
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          <span>WhatsApp conectado: {telefoneBonito(sessaoNumero)}</span>
        </div>
      ) : null}

      {onNovaConversa ? (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button
            onClick={onNovaConversa}
            className="gap-2 bg-[#00A884] hover:bg-[#008f6f] text-white font-medium shadow-xs"
          >
            <MessageSquarePlus className="size-4" />
            Nova conversa
          </Button>
        </div>
      ) : null}

      <div className="mt-14 flex items-center gap-1.5 text-xs text-muted-foreground/75">
        <Lock className="size-3.5 text-muted-foreground" />
        <span>Mensagens sincronizadas com o WhatsApp e gravadas com histórico na plataforma.</span>
      </div>
    </div>
  );
}

export function Conversa({
  conversaId,
  conversa,
  clienteId,
  somenteConsulta,
  onVoltarLista,
  onAbrirContato,
  onAbrirPosicao,
  onAbrirOrcamento,
  onNovaConversa,
  sessaoNumero,
  listaAberta,
  onAlternarLista,
}: {
  conversaId: string | null;
  conversa: WhatsappConversa | null;
  clienteId: string | null;
  somenteConsulta: { vendedorNome: string; motivo?: "desconectado" | "sem-permissao" } | null;
  /** Sem lista ao lado (a janela da Posição de Cliente), o botão não aparece. */
  onVoltarLista?: () => void;
  /** Sem ela (janela da Posição de Cliente), nada no cabeçalho leva para outra tela. */
  onAbrirContato?: () => void;
  onAbrirPosicao?: () => void;
  onAbrirOrcamento?: () => void;
  onNovaConversa?: () => void;
  sessaoNumero?: string | null;
  listaAberta?: boolean;
  onAlternarLista?: () => void;
}) {
  const empresaId = useAuthStore((s) => s.user?.empresaAtivaId);
  const queryClient = useQueryClient();
  const [respostaPendente, setRespostaPendente] = useState<{
    conversaId: string;
    mensagem: WhatsappMensagem;
  } | null>(null);
  const fimDoRolo = useRef<HTMLDivElement>(null);

  const {
    data: mensagens = [],
    isLoading: carregandoMensagens,
    error: erroMensagens,
    refetch: recarregarMensagens,
  } = useQuery<WhatsappMensagem[]>({
    queryKey: ["whatsapp-mensagens", empresaId, conversaId],
    queryFn: () =>
      apiFetch<WhatsappMensagem[]>(`/whatsapp/conversas/${conversaId}/mensagens`),
    enabled: !!conversaId,
    refetchInterval: 8000,
  });
  const { data: eventos = [] } = useQuery({
    queryKey: ["whatsapp-eventos", empresaId, conversaId],
    queryFn: () =>
      apiFetch<WhatsappEventoAtendimento[]>(
        `/whatsapp/conversas/${conversaId}/eventos`,
      ),
    enabled: !!conversaId,
    refetchInterval: 15000,
  });

  useEffect(() => {
    fimDoRolo.current?.scrollIntoView({ block: "nearest" });
  }, [mensagens?.length, conversaId]);

  useEffect(() => {
    if (!conversaId) return;
    void apiFetch(`/whatsapp/conversas/${conversaId}/lida`, { method: "POST" })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] });
        void queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
      })
      .catch(() => undefined);
  }, [conversaId, queryClient]);

  if (!conversaId) {
    return (
      <ConversaVazia
        onNovaConversa={onNovaConversa}
        sessaoNumero={sessaoNumero}
      />
    );
  }

  const porExternoId = new Map(
    (mensagens ?? []).map((m) => [m.externoId, m] as const),
  );
  const linhaDoTempo = [
    ...(mensagens ?? []).map((item) => ({
      tipo: "mensagem" as const,
      data: item.criadaEm,
      item,
    })),
    ...eventos.map((item) => ({
      tipo: "evento" as const,
      data: item.criadaEm,
      item,
    })),
  ].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

  return (
    <div data-tour="atendimento-mensagens" className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {/* Cabeçalho da conversa estilo WhatsApp Web */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/40 bg-[#F0F2F5] dark:bg-[#202C33] px-3.5">
        <div className="flex min-w-0 items-center gap-3">
          {onVoltarLista ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onVoltarLista}
              title="Voltar para conversas"
              className="-ml-1 md:hidden size-8"
            >
              <ArrowLeft className="size-5" />
            </Button>
          ) : null}

          {!listaAberta && onAlternarLista ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onAlternarLista}
              title="Mostrar lista de conversas"
              className="hidden md:inline-flex size-8 text-muted-foreground hover:text-foreground"
            >
              <PanelLeftOpen className="size-4" />
            </Button>
          ) : null}

          <button
            type="button"
            onClick={onAbrirContato}
            disabled={!onAbrirContato}
            title={onAbrirContato ? "Ver dados do contato" : undefined}
            className={`flex min-w-0 items-center gap-3 text-left group transition-opacity ${
              onAbrirContato ? "cursor-pointer hover:opacity-90" : "cursor-default"
            }`}
          >
            <div
              className={`relative flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold shadow-2xs ${avatarColorClass(
                conversa ? nomeDaConversa(conversa) : "Contato",
              )}`}
            >
              {conversa?.contato.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={assetUrl(conversa.contato.fotoUrl) ?? undefined}
                  alt=""
                  className="size-full rounded-full object-cover"
                />
              ) : (
                initials(conversa ? nomeDaConversa(conversa) : "Contato")
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-bold text-foreground group-hover:underline">
                  {conversa ? nomeDaConversa(conversa) : "Contato"}
                </p>
                {conversa?.clienteId ? (
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-medium border-emerald-500/30 text-emerald-600 bg-emerald-500/10">
                    Cliente
                  </Badge>
                ) : (
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-medium text-amber-600 bg-amber-500/10 border-amber-500/30">
                    Sem Vínculo
                  </Badge>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground flex items-center gap-1.5">
                <span>WhatsApp {telefoneBonito(conversa?.contato.telefoneNormalizado ?? null)}</span>
                {conversa?.vendedorNome
                  ? ` · Atendente: ${conversa.vendedorNome}`
                  : ""}
              </p>
            </div>
          </button>
        </div>

        <div data-tour="atendimento-acoes" className="flex shrink-0 items-center gap-1.5">
          {clienteId ? (
            <>
              {onAbrirPosicao ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAbrirPosicao}
                  className="h-8 text-xs gap-1.5 bg-background/80 hover:bg-background shadow-2xs"
                >
                  <UserRound className="size-3.5 text-primary" />
                  <span className="hidden sm:inline">Posição 360°</span>
                </Button>
              ) : null}
              {onAbrirOrcamento ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAbrirOrcamento}
                  className="h-8 text-xs gap-1.5 bg-background/80 hover:bg-background shadow-2xs"
                >
                  <BriefcaseBusiness className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="hidden sm:inline">Orçamento</span>
                </Button>
              ) : null}
            </>
          ) : onAbrirContato ? (
            <Button
              variant="default"
              size="sm"
              onClick={onAbrirContato}
              className="h-8 text-xs gap-1.5 bg-[#00A884] hover:bg-[#008f6f] text-white shadow-2xs font-medium"
            >
              <Link2 className="size-3.5" />
              <span>Vincular Cliente</span>
            </Button>
          ) : null}

          {onAbrirContato ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onAbrirContato}
              title="Dados do contato"
              className="size-8 text-muted-foreground hover:text-foreground"
            >
              <MoreVertical className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Rolo de mensagens com papel de parede característico do WhatsApp */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#EFEAE2] dark:bg-[#0B141A] bg-[radial-gradient(#0000000a_1px,transparent_1px)] dark:bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:16px_16px] p-4">
        {carregandoMensagens && mensagens.length === 0 ? (
          <div className="flex h-full min-h-[300px] flex-col items-center justify-center p-6 text-center select-none">
            <Loader2 className="size-8 animate-spin text-[#00A884] mb-3" />
            <p className="text-xs text-muted-foreground font-medium">Carregando mensagens...</p>
          </div>
        ) : erroMensagens ? (
          <div className="flex h-full min-h-[300px] flex-col items-center justify-center p-6 text-center select-none">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-3">
              <TriangleAlert className="size-6" />
            </div>
            <p className="text-sm font-semibold text-foreground">Não foi possível carregar as mensagens</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-[280px]">
              {erroMensagens instanceof ApiError ? erroMensagens.message : "Ocorreu um erro ao buscar o histórico desta conversa."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void recarregarMensagens()}
              className="mt-3.5 h-8 text-xs gap-1.5"
            >
              <RefreshCw className="size-3.5" />
              Tentar novamente
            </Button>
          </div>
        ) : linhaDoTempo.length === 0 ? (
          <div className="flex h-full min-h-[300px] flex-col items-center justify-center p-6 text-center select-none">
            <div className="flex size-12 items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow-2xs border border-border/40 mb-3">
              <MessageSquare className="size-6 text-[#00A884]" />
            </div>
            <p className="text-sm font-semibold text-foreground">Nenhuma mensagem nesta conversa</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-[320px]">
              {conversa?.clienteId
                ? "As mensagens trocadas com este cliente serão exibidas aqui."
                : "Este contato ainda não possui mensagens gravadas. Envie uma mensagem abaixo para iniciar o atendimento."}
            </p>
          </div>
        ) : (
          linhaDoTempo.map((entrada) =>
            entrada.tipo === "mensagem" ? (
              <MensagemBolha
                key={`mensagem-${entrada.item.id}`}
                mensagem={entrada.item}
                autorNome={
                  entrada.item.autorNome ??
                  (entrada.item.direcao === "saida"
                    ? entrada.item.enviadaPorNome ?? conversa?.vendedorNome ?? "Atendente"
                    : conversa
                      ? nomeDaConversa(conversa)
                      : "Contato")
                }
                conversaId={conversaId}
                citada={
                  entrada.item.respondeuA
                    ? (porExternoId.get(entrada.item.respondeuA) ?? null)
                    : null
                }
                onResponder={(mensagem) =>
                  setRespostaPendente({ conversaId, mensagem })
                }
              />
            ) : (
              <EventoComercial key={`evento-${entrada.item.id}`} evento={entrada.item} />
            ),
          )
        )}
        <div ref={fimDoRolo} />
      </div>

      {/* Compositor da mensagem */}
      {somenteConsulta ? (
        <div className="shrink-0 border-t border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <p className="font-semibold text-amber-800 dark:text-amber-300">
            {somenteConsulta.motivo === "desconectado"
              ? "Aparelho desconectado (somente leitura)"
              : "Modo somente consulta"}
          </p>
          <p className="text-muted-foreground">
            {somenteConsulta.motivo === "desconectado"
              ? "Seu WhatsApp está desconectado. O histórico anterior pode ser consultado normalmente, mas para responder é necessário reconectar o aparelho."
              : "Seu perfil não tem permissão para responder pelo WhatsApp. Peça ao administrador."}
          </p>
        </div>
      ) : (
        <div data-tour="atendimento-composer" className="flex shrink-0 items-end bg-[#F0F2F5] dark:bg-[#202C33]">
          {clienteId ? (
            <div className="pb-2.5 pl-2">
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
              respondendo={
                respostaPendente?.conversaId === conversaId
                  ? respostaPendente.mensagem
                  : null
              }
              onCancelarResposta={() => setRespostaPendente(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}


/**
 * Anotação interna: nota de quem atende, na linha do tempo da conversa. Visual
 * de bilhete, e não de balão, para nunca ser confundida com mensagem — ela
 * não foi ao cliente.
 */
function Anotacao({ evento }: { evento: WhatsappEventoAtendimento }) {
  const texto = typeof evento.detalhe?.texto === "string" ? evento.detalhe.texto : "";
  return (
    <div className="mx-auto w-full max-w-[85%] rounded-md border border-amber-400/50 bg-amber-50 px-3 py-2 text-sm shadow-xs dark:border-amber-500/30 dark:bg-amber-950/40">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300">
        <StickyNote className="size-3.5 shrink-0" />
        <span className="font-medium">Anotação interna</span>
        <span className="text-amber-700/80 dark:text-amber-300/70">
          · não enviada ao cliente
          {evento.executadaPorNome ? ` · ${evento.executadaPorNome}` : ""}
        </span>
        <time className="ml-auto shrink-0 tabular-nums">
          {new Date(evento.criadaEm).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>
      <p className="whitespace-pre-wrap break-words text-foreground">{texto}</p>
    </div>
  );
}

export function EventoComercial({ evento }: { evento: WhatsappEventoAtendimento }) {
  if (evento.acao === "anotacao") return <Anotacao evento={evento} />;
  const titulos: Record<string, string> = {
    orcamento: "Orçamento enviado ao cliente",
    agendamento: "Retorno adicionado à agenda",
    boleto: "Segunda via do boleto enviada",
    danfe: "DANFE enviada ao cliente",
    titulos_resumo: "Resumo financeiro enviado",
    notas_resumo: "Resumo de notas fiscais enviado",
  };
  const detalhe = evento.detalhe;
  const descricao =
    typeof detalhe?.titulo === "string"
      ? detalhe.titulo
      : typeof detalhe?.numero === "string" || typeof detalhe?.numero === "number"
        ? `Documento ${detalhe.numero}`
        : null;

  return (
    <div className="mx-auto flex w-fit max-w-[90%] items-center gap-2 rounded-full border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
      <CalendarCheck2 className="size-3.5 shrink-0 text-primary" />
      <span className="truncate">
        <span className="font-medium text-foreground">
          {titulos[evento.acao] ?? "Ação comercial registrada"}
        </span>
        {descricao ? ` · ${descricao}` : ""}
        {evento.executadaPorNome ? ` · ${evento.executadaPorNome}` : ""}
      </span>
      <time className="shrink-0 tabular-nums">
        {new Date(evento.criadaEm).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </time>
    </div>
  );
}

/** Telefone só com dígitos (é como fica gravado) no formato que se lê. */
export function telefoneBonito(digitos: string | null) {
  if (!digitos) return null;
  const d = digitos.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digitos;
}
