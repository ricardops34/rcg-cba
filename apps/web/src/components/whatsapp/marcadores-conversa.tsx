"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Flag, Pin, Plus, Tag, Trash2 } from "lucide-react";
import {
  WHATSAPP_ETIQUETA_CORES,
  type WhatsappConversa,
  type WhatsappEtiqueta,
  type WhatsappEtiquetaCor,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Marcadores de organização da conversa: **importante** (bandeira vermelha,
 * liga e desliga com um toque), **fixar** no topo (até 4) e **etiquetas**
 * pessoais do contato.
 */

/** Cores das etiquetas: o conjunto fixo do contrato, com o par fundo/texto de cada uma. */
export const COR_ETIQUETA: Record<WhatsappEtiquetaCor, { chip: string; ponto: string }> = {
  vermelho: { chip: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200", ponto: "bg-red-500" },
  laranja: { chip: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200", ponto: "bg-orange-500" },
  amarelo: { chip: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200", ponto: "bg-yellow-500" },
  verde: { chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", ponto: "bg-emerald-500" },
  azul: { chip: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200", ponto: "bg-blue-500" },
  roxo: { chip: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200", ponto: "bg-violet-500" },
  rosa: { chip: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200", ponto: "bg-pink-500" },
  cinza: { chip: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200", ponto: "bg-slate-500" },
};

export function EtiquetaChip({
  etiqueta,
  className,
}: {
  etiqueta: Pick<WhatsappEtiqueta, "nome" | "cor">;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-28 items-center truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
        COR_ETIQUETA[etiqueta.cor].chip,
        className,
      )}
      title={etiqueta.nome}
    >
      <span className="truncate">{etiqueta.nome}</span>
    </span>
  );
}

/** As etiquetas do usuário — a lista e o filtro leem a mesma consulta. */
export function useMinhasEtiquetas(enabled = true) {
  return useQuery({
    queryKey: ["whatsapp-etiquetas"],
    queryFn: () => apiFetch<WhatsappEtiqueta[]>("/whatsapp/etiquetas"),
    enabled,
    staleTime: 60_000,
  });
}

/** O que muda numa conversa refresca a lista e o detalhe. */
function useAtualizarConversas() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] });
    void queryClient.invalidateQueries({ queryKey: ["whatsapp-conversa"] });
  };
}

const mensagemDeErro = (err: unknown, padrao: string) =>
  err instanceof ApiError ? err.message : padrao;

/** Bandeira vermelha: um toque marca, outro desmarca. */
export function BotaoImportante({
  conversa,
  desabilitado,
}: {
  conversa: Pick<WhatsappConversa, "id" | "importante">;
  desabilitado?: boolean;
}) {
  const atualizar = useAtualizarConversas();
  const marcada = !!conversa.importante;
  const alternar = useMutation({
    mutationFn: () =>
      apiFetch(`/whatsapp/conversas/${conversa.id}/importante`, {
        method: "PATCH",
        body: { importante: !marcada },
      }),
    onSuccess: atualizar,
    onError: (err) => toast.error(mensagemDeErro(err, "Não foi possível marcar a conversa")),
  });
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={desabilitado || alternar.isPending}
      onClick={() => alternar.mutate()}
      aria-pressed={marcada}
      title={marcada ? "Importante — toque para desmarcar" : "Marcar como importante"}
      className="size-8"
    >
      <Flag
        className={cn(
          "size-4",
          marcada ? "fill-red-500 text-red-500" : "text-muted-foreground",
        )}
      />
    </Button>
  );
}

/** Fixa a conversa no topo da lista (até 4); o servidor recusa a quinta. */
export function BotaoFixar({
  conversa,
  desabilitado,
}: {
  conversa: Pick<WhatsappConversa, "id" | "fixadaEm">;
  desabilitado?: boolean;
}) {
  const atualizar = useAtualizarConversas();
  const fixada = !!conversa.fixadaEm;
  const alternar = useMutation({
    mutationFn: () =>
      apiFetch(`/whatsapp/conversas/${conversa.id}/fixada`, {
        method: "PATCH",
        body: { fixada: !fixada },
      }),
    onSuccess: atualizar,
    onError: (err) => toast.error(mensagemDeErro(err, "Não foi possível fixar a conversa")),
  });
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={desabilitado || alternar.isPending}
      onClick={() => alternar.mutate()}
      aria-pressed={fixada}
      title={fixada ? "Fixada no topo — toque para soltar" : "Fixar no topo da lista (até 4)"}
      className="size-8"
    >
      <Pin
        className={cn(
          "size-4",
          fixada ? "fill-foreground text-foreground" : "text-muted-foreground",
        )}
      />
    </Button>
  );
}

/** Escolhe, cria e apaga as etiquetas pessoais do contato. */
export function BotaoEtiquetas({
  conversa,
  desabilitado,
}: {
  conversa: Pick<WhatsappConversa, "id" | "etiquetas">;
  desabilitado?: boolean;
}) {
  const atualizar = useAtualizarConversas();
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState<WhatsappEtiquetaCor>("azul");
  const minhas = useMinhasEtiquetas(aberto);
  const aplicadas = new Set((conversa.etiquetas ?? []).map((e) => e.id));

  const definir = useMutation({
    mutationFn: (etiquetaIds: string[]) =>
      apiFetch(`/whatsapp/conversas/${conversa.id}/etiquetas`, {
        method: "PUT",
        body: { etiquetaIds },
      }),
    onSuccess: atualizar,
    onError: (err) => toast.error(mensagemDeErro(err, "Não foi possível etiquetar")),
  });
  const criar = useMutation({
    mutationFn: () =>
      apiFetch<WhatsappEtiqueta>("/whatsapp/etiquetas", {
        method: "POST",
        body: { nome: nome.trim(), cor },
      }),
    onSuccess: (nova) => {
      setNome("");
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-etiquetas"] });
      // A etiqueta nova já entra aplicada: criar no contato é para usar nele.
      definir.mutate([...aplicadas, nova.id]);
    },
    onError: (err) => toast.error(mensagemDeErro(err, "Não foi possível criar a etiqueta")),
  });
  const excluir = useMutation({
    mutationFn: (id: string) => apiFetch(`/whatsapp/etiquetas/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-etiquetas"] });
      atualizar();
    },
    onError: (err) => toast.error(mensagemDeErro(err, "Não foi possível excluir a etiqueta")),
  });

  const alternar = (id: string) => {
    const proximas = new Set(aplicadas);
    if (proximas.has(id)) proximas.delete(id);
    else proximas.add(id);
    definir.mutate([...proximas]);
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={desabilitado}
          title="Etiquetas do contato"
          className="relative size-8"
        >
          <Tag
            className={cn("size-4", aplicadas.size > 0 ? "text-primary" : "text-muted-foreground")}
          />
          {aplicadas.size > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
              {aplicadas.size}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3">
        <p className="text-xs font-medium text-muted-foreground">Minhas etiquetas</p>

        <div className="max-h-48 space-y-0.5 overflow-y-auto">
          {(minhas.data ?? []).length === 0 && !minhas.isLoading ? (
            <p className="py-2 text-xs text-muted-foreground">
              Você ainda não criou etiquetas. Crie a primeira abaixo.
            </p>
          ) : null}
          {(minhas.data ?? []).map((e) => (
            <div key={e.id} className="group flex items-center gap-1 rounded-md hover:bg-muted/60">
              <button
                type="button"
                onClick={() => alternar(e.id)}
                disabled={definir.isPending}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
              >
                <span className={cn("size-2.5 shrink-0 rounded-full", COR_ETIQUETA[e.cor].ponto)} />
                <span className="min-w-0 flex-1 truncate">{e.nome}</span>
                {aplicadas.has(e.id) ? <Check className="size-4 shrink-0 text-primary" /> : null}
              </button>
              <button
                type="button"
                aria-label={`Excluir a etiqueta ${e.nome}`}
                title="Excluir etiqueta (sai de todos os contatos)"
                disabled={excluir.isPending}
                onClick={() => {
                  if (confirm(`Excluir a etiqueta "${e.nome}"? Ela sai de todos os contatos.`)) {
                    excluir.mutate(e.id);
                  }
                }}
                className="rounded p-1.5 text-muted-foreground opacity-60 hover:text-destructive hover:opacity-100 md:opacity-0 md:group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>

        <form
          className="space-y-2 border-t pt-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (nome.trim()) criar.mutate();
          }}
        >
          <p className="text-xs font-medium text-muted-foreground">Nova etiqueta</p>
          <div className="flex gap-2">
            <Input
              value={nome}
              onChange={(ev) => setNome(ev.target.value)}
              maxLength={30}
              placeholder="Ex.: Pós-venda"
              className="h-8 text-sm"
            />
            <Button type="submit" size="sm" disabled={!nome.trim() || criar.isPending}>
              <Plus className="size-4" />
              Criar
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cor da etiqueta">
            {WHATSAPP_ETIQUETA_CORES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={cor === c}
                aria-label={c}
                onClick={() => setCor(c)}
                className={cn(
                  "size-5 rounded-full border-2",
                  COR_ETIQUETA[c].ponto,
                  cor === c ? "border-foreground" : "border-transparent",
                )}
              />
            ))}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
