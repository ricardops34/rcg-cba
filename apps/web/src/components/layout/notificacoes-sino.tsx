"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClockOff,
  Bell,
  CheckCheck,
  CircleCheck,
  CircleX,
  ListChecks,
  MessageCircle,
  Receipt,
  UserPlus,
} from "lucide-react";
import type {
  NotificacaoItem,
  NotificacaoTipo,
  NotificacoesFeed,
} from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const ICONE: Record<NotificacaoTipo, typeof Bell> = {
  whatsapp_mensagem: MessageCircle,
  whatsapp_agendamento_erro: AlarmClockOff,
  atividade_vencimento: ListChecks,
  orcamento_aprovado: CircleCheck,
  orcamento_recusado: CircleX,
  cliente_atribuido: UserPlus,
  titulo_vencido: Receipt,
};

/** O que aparece em vermelho: prazo estourado ou algo que falhou. */
const URGENTE: Record<NotificacaoTipo, boolean> = {
  whatsapp_mensagem: false,
  whatsapp_agendamento_erro: true,
  atividade_vencimento: true,
  orcamento_aprovado: false,
  orcamento_recusado: true,
  cliente_atribuido: false,
  titulo_vencido: true,
};

/**
 * Sino da topbar.
 *
 * Lê `GET /notificacoes`, que devolve as **não lidas** do usuário — a tabela
 * `notificacoes` é a fonte única, gravada por quem provoca o fato. Abrir a
 * origem também limpa o aviso (a conversa marcada como lida marca as
 * notificações dela), então clicar aqui é só o atalho.
 */
export function NotificacoesSino() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);

  const { data } = useQuery({
    queryKey: ["notificacoes"],
    queryFn: () => apiFetch<NotificacoesFeed>("/notificacoes"),
    // O sino fica em todas as telas: 60 s avisa sem transformar a topbar num
    // segundo polling caro. A tela de atendimento, que precisa ser viva, tem
    // o dela em 15 s.
    refetchInterval: 60_000,
  });

  const marcarTodas = useMutation({
    mutationFn: () => apiFetch("/notificacoes/lidas", { method: "POST" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notificacoes"] }),
  });

  const total = data?.total ?? 0;

  const abrir = (item: NotificacaoItem) => {
    setAberto(false);
    // Marca e navega sem esperar: a leitura não pode atrasar a abertura da
    // tela, e se a marcação falhar o item continua lá — que é o certo.
    void apiFetch(`/notificacoes/${item.id}/lida`, { method: "POST" })
      .then(() => queryClient.invalidateQueries({ queryKey: ["notificacoes"] }))
      .catch(() => undefined);
    if (item.rota) router.push(item.rota);
  };

  return (
    <DropdownMenu open={aberto} onOpenChange={setAberto}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={total ? `Notificações (${total})` : "Notificações"}
        >
          <Bell className="size-4.5" />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.6rem] font-semibold text-white">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Notificações</span>
          {total > 0 && (
            <button
              onClick={() => marcarTodas.mutate()}
              disabled={marcarTodas.isPending}
              className="flex items-center gap-1 text-xs font-normal text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <CheckCheck className="size-3.5" />
              Marcar todas
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!data?.itens.length ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Nenhuma notificação por enquanto.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {data.itens.map((item) => (
              <Linha key={item.id} item={item} onAbrir={abrir} />
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A descrição da mensagem de WhatsApp é montada aqui, e não gravada no banco:
 * a linha acumula as mensagens seguintes da mesma conversa, e um texto gravado
 * ficaria em "1 mensagem nova" para sempre.
 */
function descricaoDe(item: NotificacaoItem) {
  if (item.tipo !== "whatsapp_mensagem") return item.descricao;
  return item.contador === 1 ? "1 mensagem nova" : `${item.contador} mensagens novas`;
}

function Linha({
  item,
  onAbrir,
}: {
  item: NotificacaoItem;
  onAbrir: (item: NotificacaoItem) => void;
}) {
  const Icone = ICONE[item.tipo];
  const urgente = URGENTE[item.tipo];
  const descricao = descricaoDe(item);
  return (
    // Um <button> em vez de DropdownMenuItem: a linha tem duas alturas de
    // texto e o item do menu força uma só, cortando a descrição.
    <button
      onClick={() => onAbrir(item)}
      className="flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left transition-colors hover:bg-accent"
    >
      <Icone
        className={cn(
          "mt-0.5 size-4 shrink-0",
          urgente ? "text-destructive" : "text-muted-foreground",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.titulo}</p>
        {descricao && (
          <p className="truncate text-xs text-muted-foreground">{descricao}</p>
        )}
      </div>
      <span
        className={cn(
          "shrink-0 pt-0.5 text-[0.65rem]",
          urgente ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {new Date(item.data).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </button>
  );
}
