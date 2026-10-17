"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, MessageCircle, Pencil, Trash2 } from "lucide-react";
import {
  ROTEIRO_ITEM_STATUS_ROTULO,
  ROTEIRO_MOTIVO_ROTULO,
  type RoteiroConfirmacaoResultado,
  type RoteiroItem,
  type RoteiroItemStatus,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const diaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const maisDias = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const paraInputLocal = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${diaLocal(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Cor de cada situação — a de erro e a de cancelado chamam atenção, o resto é neutro. */
const COR_STATUS: Record<RoteiroItemStatus, string> = {
  agendado: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  confirmado: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  iniciado: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  finalizado: "border-border bg-muted text-muted-foreground",
  cancelado: "border-border bg-muted text-muted-foreground line-through",
  erro: "border-destructive/40 bg-destructive/10 text-destructive",
};

/** Itens do roteiro do usuário num período — a Agenda e a conversa leem a mesma consulta. */
export function useItensDoRoteiro(de: string, ate: string, enabled = true) {
  return useQuery({
    queryKey: ["roteiro-itens", de, ate],
    queryFn: () => apiFetch<RoteiroItem[]>("/whatsapp/roteiros/itens", { query: { de, ate } }),
    enabled,
    refetchInterval: 30_000,
  });
}

/**
 * O roteiro semanal do vendedor: confirmar o dia, remarcar, cancelar (um ou
 * vários, sempre com motivo) e abrir a conversa. Finalizar o atendimento
 * iniciado é feito na própria conversa, mas também está aqui.
 */
export function RoteiroPainel({
  aberto,
  onOpenChange,
  diaEmFoco,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  /** Vindo do aviso "confirme os atendimentos de hoje": destaca esse dia. */
  diaEmFoco?: string | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const de = diaLocal(new Date());
  const ate = diaLocal(maisDias(new Date(), 30));
  const itensQuery = useItensDoRoteiro(de, ate, aberto);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [cancelando, setCancelando] = useState<string[] | null>(null);
  const [remarcando, setRemarcando] = useState<RoteiroItem | null>(null);
  const [finalizando, setFinalizando] = useState<RoteiroItem | null>(null);

  const porDia = useMemo(() => {
    const mapa = new Map<string, RoteiroItem[]>();
    for (const i of itensQuery.data ?? []) {
      const dia = diaLocal(new Date(i.quando));
      mapa.set(dia, [...(mapa.get(dia) ?? []), i]);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [itensQuery.data]);

  const recarregar = () => {
    void queryClient.invalidateQueries({ queryKey: ["roteiro-itens"] });
    void queryClient.invalidateQueries({ queryKey: ["atividades"] });
    void queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
  };

  const confirmar = useMutation({
    mutationFn: (dia: string) =>
      apiFetch<RoteiroConfirmacaoResultado>("/whatsapp/roteiros/confirmar", {
        method: "POST",
        body: { dia },
      }),
    onSuccess: (r) => {
      recarregar();
      const partes = [`${r.confirmados} confirmado(s)`];
      if (r.comErro.length) partes.push(`${r.comErro.length} com problema (veja na lista)`);
      if (r.atrasados.length) partes.push(`${r.atrasados.length} fora de hora (remarque)`);
      (r.comErro.length || r.atrasados.length ? toast.warning : toast.success)(partes.join(" · "));
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Não foi possível confirmar"),
  });

  const alternar = (id: string) =>
    setMarcados((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const podeAgir = (s: RoteiroItemStatus) => s === "agendado" || s === "confirmado";

  return (
    <>
      <Sheet
        open={aberto}
        onOpenChange={(v) => {
          if (!v) setMarcados(new Set());
          onOpenChange(v);
        }}
      >
        <ResizableSheetContent defaultWidth={620} className="p-0">
          <SheetHeader className="shrink-0 border-b pr-14">
            <SheetTitle>Meu roteiro de atendimentos</SheetTitle>
            <SheetDescription>
              Confirme o dia para o sistema abrir as conversas na hora. Sem confirmação, nada é enviado.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {marcados.size > 0 ? (
              <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-lg border bg-card p-2 shadow-sm">
                <span className="text-sm">{marcados.size} selecionado(s)</span>
                <Button size="sm" variant="destructive" onClick={() => setCancelando([...marcados])}>
                  <Trash2 className="size-4" />
                  Cancelar selecionados
                </Button>
              </div>
            ) : null}

            {itensQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : porDia.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Você não tem atendimentos de roteiro nos próximos 30 dias. Use <strong>Gerar roteiro</strong>.
              </p>
            ) : (
              porDia.map(([dia, itens]) => {
                const aConfirmar = itens.filter((i) => i.status === "agendado");
                return (
                  <section
                    key={dia}
                    className={cn("space-y-2 rounded-lg", dia === diaEmFoco && "ring-2 ring-primary/50 p-2")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold capitalize">
                        {new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                      </h3>
                      {aConfirmar.length > 0 ? (
                        <Button size="sm" disabled={confirmar.isPending} onClick={() => confirmar.mutate(dia)}>
                          <CheckCircle2 className="size-4" />
                          Confirmar {aConfirmar.length}
                        </Button>
                      ) : null}
                    </div>

                    <ul className="divide-y rounded-lg border bg-card">
                      {itens.map((i) => (
                        <li key={i.id} className="flex items-start gap-3 px-3 py-2.5">
                          <Checkbox
                            className="mt-1"
                            disabled={!podeAgir(i.status)}
                            checked={marcados.has(i.id)}
                            onCheckedChange={() => alternar(i.id)}
                            aria-label={`Selecionar ${i.clienteNome}`}
                          />
                          <span className="w-11 shrink-0 pt-0.5 text-sm tabular-nums text-muted-foreground">
                            {hora(i.quando)}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="break-words text-sm font-medium">{i.clienteNome}</p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className={cn("text-[10px]", COR_STATUS[i.status])}>
                                {ROTEIRO_ITEM_STATUS_ROTULO[i.status]}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {i.motivos.map((m) => ROTEIRO_MOTIVO_ROTULO[m]).join(" · ")}
                              </span>
                            </div>
                            {i.erro ? <p className="text-xs text-destructive">{i.erro}</p> : null}
                            {i.motivoCancelamento ? (
                              <p className="text-xs text-muted-foreground">Motivo: {i.motivoCancelamento}</p>
                            ) : null}
                            {i.resultado ? (
                              <p className="text-xs text-muted-foreground">Resultado: {i.resultado}</p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {i.conversaId && (i.status === "iniciado" || i.status === "finalizado") ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8"
                                title="Abrir a conversa"
                                onClick={() => router.push(`/comercial/atendimento?conversa=${i.conversaId}`)}
                              >
                                <MessageCircle className="size-4" />
                              </Button>
                            ) : null}
                            {i.status === "iniciado" ? (
                              <Button size="sm" variant="outline" onClick={() => setFinalizando(i)}>
                                Finalizar
                              </Button>
                            ) : null}
                            {podeAgir(i.status) ? (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-8"
                                  title="Remarcar"
                                  onClick={() => setRemarcando(i)}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-8 text-destructive"
                                  title="Cancelar"
                                  onClick={() => setCancelando([i.id])}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })
            )}
          </div>
        </ResizableSheetContent>
      </Sheet>

      <CancelarDialog
        ids={cancelando}
        onClose={() => setCancelando(null)}
        onFeito={() => {
          setMarcados(new Set());
          recarregar();
        }}
      />
      <RemarcarDialog item={remarcando} onClose={() => setRemarcando(null)} onFeito={recarregar} />
      <FinalizarDialog item={finalizando} onClose={() => setFinalizando(null)} onFeito={recarregar} />
    </>
  );
}

function CancelarDialog({
  ids,
  onClose,
  onFeito,
}: {
  ids: string[] | null;
  onClose: () => void;
  onFeito: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const cancelar = useMutation({
    mutationFn: () =>
      apiFetch<{ canceladas: number }>("/whatsapp/roteiros/itens/cancelar", {
        method: "POST",
        body: { itemIds: ids, motivo: motivo.trim() },
      }),
    onSuccess: (r) => {
      toast.success(`${r.canceladas} cancelado(s). Supervisão e gerência foram avisadas.`);
      setMotivo("");
      onFeito();
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Não foi possível cancelar"),
  });
  return (
    <Dialog open={!!ids} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar {ids?.length === 1 ? "atendimento" : `${ids?.length} atendimentos`}</DialogTitle>
          <DialogDescription>
            Eles saem da agenda e a supervisão e a gerência são avisadas. O motivo é obrigatório.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          rows={3}
          maxLength={300}
          placeholder="Por que está cancelando?"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={motivo.trim().length < 5 || cancelar.isPending}
            onClick={() => cancelar.mutate()}
          >
            {cancelar.isPending ? "Cancelando…" : "Cancelar atendimento(s)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemarcarDialog({
  item,
  onClose,
  onFeito,
}: {
  item: RoteiroItem | null;
  onClose: () => void;
  onFeito: () => void;
}) {
  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        {/* Remonta a cada item: o horário e o motivo nascem do item aberto. */}
        {item ? <RemarcarConteudo key={item.id} item={item} onClose={onClose} onFeito={onFeito} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RemarcarConteudo({
  item,
  onClose,
  onFeito,
}: {
  item: RoteiroItem;
  onClose: () => void;
  onFeito: () => void;
}) {
  const [quando, setQuando] = useState(() => paraInputLocal(item.quando));
  const [motivo, setMotivo] = useState("");
  const remarcar = useMutation({
    mutationFn: () =>
      apiFetch(`/whatsapp/roteiros/itens/${item.id}/remarcar`, {
        method: "PATCH",
        body: { quando: new Date(quando).toISOString(), motivo: motivo.trim() },
      }),
    onSuccess: () => {
      toast.success("Remarcado. Confirme o dia de novo para valer.");
      onFeito();
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Não foi possível remarcar"),
  });
  return (
    <>
      <DialogHeader>
        <DialogTitle>Remarcar atendimento</DialogTitle>
        <DialogDescription>
          {item.clienteNome}. O novo horário precisa ser livre, em dia útil e no seu horário de trabalho.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <Input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
        <Textarea
          rows={2}
          maxLength={300}
          placeholder="Motivo da remarcação"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button disabled={!quando || motivo.trim().length < 5 || remarcar.isPending} onClick={() => remarcar.mutate()}>
          {remarcar.isPending ? "Remarcando…" : "Remarcar"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Finaliza o atendimento iniciado pelo roteiro (também usado dentro da conversa). */
export function FinalizarDialog({
  item,
  onClose,
  onFeito,
}: {
  item: Pick<RoteiroItem, "id" | "clienteNome"> | null;
  onClose: () => void;
  onFeito: () => void;
}) {
  const [resultado, setResultado] = useState("");
  const finalizar = useMutation({
    mutationFn: () =>
      apiFetch(`/whatsapp/roteiros/itens/${item!.id}/finalizar`, {
        method: "POST",
        body: { resultado: resultado.trim() },
      }),
    onSuccess: () => {
      toast.success("Atendimento finalizado e registrado no histórico.");
      setResultado("");
      onFeito();
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Não foi possível finalizar"),
  });
  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Finalizar atendimento</DialogTitle>
          <DialogDescription>
            {item?.clienteNome}. O resultado fica no histórico de atendimento do cliente.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          rows={4}
          maxLength={1000}
          placeholder="Como foi? O que ficou combinado?"
          value={resultado}
          onChange={(e) => setResultado(e.target.value)}
        />
        <DialogFooter>
          <Button disabled={resultado.trim().length < 3 || finalizar.isPending} onClick={() => finalizar.mutate()}>
            {finalizar.isPending ? "Registrando…" : "Finalizar e registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
