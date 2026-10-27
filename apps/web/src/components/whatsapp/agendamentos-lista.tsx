"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Flag, Pencil, X } from "lucide-react";
import type {
  WhatsappAtendimentoAgendado,
  WhatsappMensagemAgendada,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * O que está agendado nesta conversa — mensagens que saem sozinhas e
 * atendimentos que avisam o vendedor —, com **Alterar** e **Cancelar** antes
 * da hora. Os dois também aparecem na Agenda do vendedor (são atividades).
 *
 * Mostrar a lista no mesmo lugar em que se agenda evita o erro de sempre:
 * agendar sem ver o que já está marcado e mandar a mesma cobrança duas vezes.
 */

/** `datetime-local` não tem fuso: monta o valor na hora local de quem olha. */
export function paraInputLocal(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const quandoBr = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function Linha({
  titulo,
  detalhe,
  quando,
  erro,
  importante,
  onImportante,
  onEditar,
  onCancelar,
  ocupado,
}: {
  titulo: string;
  detalhe?: string | null;
  quando: string;
  erro?: string | null;
  importante?: boolean;
  /** Liga e desliga a bandeira; ausente = sem o botão. */
  onImportante?: () => void;
  onEditar?: () => void;
  onCancelar: () => void;
  ocupado: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <div className="min-w-0">
        <p className="break-words">{titulo}</p>
        {detalhe ? <p className="truncate text-xs text-muted-foreground">{detalhe}</p> : null}
        <p className="text-xs text-muted-foreground">
          {quandoBr(quando)}
          {erro ? <span className="text-destructive"> — falhou: {erro}</span> : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onImportante ? (
          <button
            type="button"
            title={importante ? "Importante — toque para desmarcar" : "Marcar como importante"}
            aria-label="Importante"
            aria-pressed={!!importante}
            disabled={ocupado}
            onClick={onImportante}
            className="rounded p-1 hover:bg-muted"
          >
            <Flag
              className={`size-4 ${importante ? "fill-red-500 text-red-500" : "text-muted-foreground"}`}
            />
          </button>
        ) : null}
        {onEditar ? (
          <button
            type="button"
            title="Alterar"
            aria-label="Alterar"
            disabled={ocupado}
            onClick={onEditar}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
        ) : null}
        <button
          type="button"
          title="Cancelar"
          aria-label="Cancelar"
          disabled={ocupado}
          onClick={onCancelar}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Mensagens agendadas pendentes (e as que falharam, para o vendedor ver). */
export function MensagensAgendadasLista({
  conversaId,
  aberto,
}: {
  conversaId: string;
  aberto: boolean;
}) {
  const queryClient = useQueryClient();
  const chave = ["whatsapp-agendamentos", conversaId];
  const query = useQuery({
    queryKey: chave,
    queryFn: () =>
      apiFetch<WhatsappMensagemAgendada[]>(`/whatsapp/conversas/${conversaId}/agendamentos`),
    enabled: aberto,
  });
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [quando, setQuando] = useState("");

  const atualizar = (aviso: string) => ({
    onSuccess: () => {
      toast.success(aviso);
      setEditando(null);
      // A atividade da Agenda acompanha o agendamento.
      void queryClient.invalidateQueries({ queryKey: chave });
      void queryClient.invalidateQueries({ queryKey: ["atividades"] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao salvar o agendamento"),
  });

  const salvar = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/whatsapp/conversas/${conversaId}/agendamentos/${id}`, {
        method: "PATCH",
        body: { texto, enviarEm: new Date(quando).toISOString() },
      }),
    ...atualizar("Agendamento alterado"),
  });
  const cancelar = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/whatsapp/conversas/${conversaId}/agendamentos/${id}`, { method: "DELETE" }),
    ...atualizar("Agendamento cancelado"),
  });
  const marcar = useMutation({
    mutationFn: ({ id, importante }: { id: string; importante: boolean }) =>
      apiFetch(`/whatsapp/conversas/${conversaId}/agendamentos/${id}`, {
        method: "PATCH",
        body: { importante },
      }),
    ...atualizar("Agendamento atualizado"),
  });

  const itens = query.data ?? [];
  if (itens.length === 0) return null;
  const ocupado = salvar.isPending || cancelar.isPending || marcar.isPending;

  return (
    <div className="space-y-2 rounded-md border p-2">
      <p className="text-xs font-medium text-muted-foreground">Mensagens já agendadas</p>
      {itens.map((a) =>
        editando === a.id ? (
          <div key={a.id} className="space-y-2 rounded-md bg-muted/40 p-2">
            <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} />
            <Input
              type="datetime-local"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(null)}>
                Descartar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!texto.trim() || !quando || ocupado}
                onClick={() => salvar.mutate(a.id)}
              >
                {salvar.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        ) : (
          <Linha
            key={a.id}
            titulo={a.texto}
            quando={a.enviarEm}
            erro={a.status === "erro" ? a.erro : null}
            importante={a.importante}
            // A bandeira é da agenda: só a pendente tem atividade para marcar.
            onImportante={
              a.status === "pendente"
                ? () => marcar.mutate({ id: a.id, importante: !a.importante })
                : undefined
            }
            ocupado={ocupado}
            // Só a pendente se altera; a que falhou só se cancela (e agenda-se outra).
            onEditar={
              a.status === "pendente"
                ? () => {
                    setEditando(a.id);
                    setTexto(a.texto);
                    setQuando(paraInputLocal(a.enviarEm));
                  }
                : undefined
            }
            onCancelar={() => cancelar.mutate(a.id)}
          />
        ),
      )}
    </div>
  );
}

/** Atendimentos agendados em aberto: na hora marcada, o sino avisa e a conversa abre. */
export function AtendimentosAgendadosLista({
  conversaId,
  aberto,
}: {
  conversaId: string;
  aberto: boolean;
}) {
  const queryClient = useQueryClient();
  const chave = ["whatsapp-atendimentos-agendados", conversaId];
  const query = useQuery({
    queryKey: chave,
    queryFn: () =>
      apiFetch<WhatsappAtendimentoAgendado[]>(
        `/whatsapp/conversas/${conversaId}/atendimentos-agendados`,
      ),
    enabled: aberto,
  });
  const [editando, setEditando] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [quando, setQuando] = useState("");

  const depois = (aviso: string) => ({
    onSuccess: () => {
      toast.success(aviso);
      setEditando(null);
      void queryClient.invalidateQueries({ queryKey: chave });
      void queryClient.invalidateQueries({ queryKey: ["atividades"] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao salvar o atendimento"),
  });

  const salvar = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/whatsapp/conversas/${conversaId}/atendimentos-agendados/${id}`, {
        method: "PATCH",
        body: { titulo, dataVencimento: new Date(quando).toISOString() },
      }),
    ...depois("Atendimento alterado"),
  });
  const cancelar = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/whatsapp/conversas/${conversaId}/atendimentos-agendados/${id}`, {
        method: "DELETE",
      }),
    ...depois("Atendimento cancelado"),
  });
  const marcar = useMutation({
    mutationFn: ({ id, importante }: { id: string; importante: boolean }) =>
      apiFetch(`/whatsapp/conversas/${conversaId}/atendimentos-agendados/${id}`, {
        method: "PATCH",
        body: { importante },
      }),
    ...depois("Atendimento atualizado"),
  });

  const itens = query.data ?? [];
  if (itens.length === 0) return null;
  const ocupado = salvar.isPending || cancelar.isPending || marcar.isPending;

  return (
    <div className="space-y-2 rounded-md border p-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <CalendarClock className="size-3.5" />
        Atendimentos já agendados
      </p>
      {itens.map((a) =>
        editando === a.id ? (
          <div key={a.id} className="space-y-2 rounded-md bg-muted/40 p-2">
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            <Input
              type="datetime-local"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(null)}>
                Descartar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!titulo.trim() || !quando || ocupado}
                onClick={() => salvar.mutate(a.id)}
              >
                {salvar.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        ) : (
          <Linha
            key={a.id}
            titulo={a.titulo}
            detalhe={
              a.naoRealizada
                ? `Não realizado — ${a.motivoNaoRealizacao ?? "sem motivo registrado"}`
                : a.descricao
            }
            quando={a.dataVencimento}
            importante={a.importante}
            onImportante={() => marcar.mutate({ id: a.id, importante: !a.importante })}
            ocupado={ocupado}
            onEditar={() => {
              setEditando(a.id);
              setTitulo(a.titulo);
              setQuando(paraInputLocal(a.dataVencimento));
            }}
            onCancelar={() => cancelar.mutate(a.id)}
          />
        ),
      )}
    </div>
  );
}
