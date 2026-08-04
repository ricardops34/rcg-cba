"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { EstagioOportunidade, Oportunidade } from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useResourceMutations } from "@/hooks/use-resource";
import { ESTAGIOS } from "@/components/crud/oportunidade-estagio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const moeda = (v: number | null) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const dataBr = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

interface KanbanProps {
  search: string;
  vendedorId?: string;
  ativo?: boolean;
  onEdit: (oportunidade: Oportunidade) => void;
}

interface PendenteMotivo {
  id: string;
  titulo: string;
}

export function OportunidadesKanban({ search, vendedorId, ativo, onEdit }: KanbanProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const { update } = useResourceMutations<never, { estagio: EstagioOportunidade; motivoPerda?: string }>(
    "oportunidades",
  );
  const [pendente, setPendente] = useState<PendenteMotivo | null>(null);
  const [motivo, setMotivo] = useState("");

  const mover = async (id: string, estagio: EstagioOportunidade, motivoPerda?: string) => {
    try {
      await update.mutateAsync({ id, input: { estagio, motivoPerda } });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao mover oportunidade");
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const estagioAtual = active.data.current?.estagioAtual as EstagioOportunidade | undefined;
    const estagioDestino = over.id as EstagioOportunidade;
    if (!estagioAtual || estagioAtual === estagioDestino) return;

    if (estagioDestino === "perdida") {
      setPendente({ id: active.id as string, titulo: (active.data.current?.titulo as string) ?? "" });
      setMotivo("");
      return;
    }
    void mover(active.id as string, estagioDestino);
  };

  const confirmarPerda = async () => {
    if (!pendente) return;
    await mover(pendente.id, "perdida", motivo || undefined);
    setPendente(null);
    setMotivo("");
  };

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {ESTAGIOS.map((e) => (
            <KanbanColumn
              key={e.value}
              estagio={e.value}
              label={e.label}
              search={search}
              vendedorId={vendedorId}
              ativo={ativo}
              onEdit={onEdit}
            />
          ))}
        </div>
      </DndContext>

      <Dialog open={!!pendente} onOpenChange={(open) => !open && setPendente(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motivo da perda</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Oportunidade &quot;{pendente?.titulo}&quot; será marcada como perdida.
          </p>
          <Textarea
            rows={3}
            placeholder="Motivo (opcional)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendente(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmarPerda()} disabled={update.isPending}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function KanbanColumn({
  estagio,
  label,
  search,
  vendedorId,
  ativo,
  onEdit,
}: {
  estagio: EstagioOportunidade;
  label: string;
  search: string;
  vendedorId?: string;
  ativo?: boolean;
  onEdit: (oportunidade: Oportunidade) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: estagio });

  const { data, isLoading } = useQuery({
    queryKey: ["oportunidades", "kanban", estagio, search, vendedorId, ativo],
    queryFn: () =>
      apiFetch<{ data: Oportunidade[]; total: number }>("/oportunidades", {
        query: {
          estagio,
          search: search || undefined,
          vendedorId,
          ativo,
          pageSize: 50,
          sortBy: "createdAt",
          sortOrder: "desc",
        },
      }),
  });

  const oportunidades = data?.data ?? [];

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 ${isOver ? "ring-2 ring-primary" : ""}`}
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-sm font-medium">{label}</span>
        <Badge variant="outline">{data?.total ?? oportunidades.length}</Badge>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 320px)" }}>
        {isLoading && (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        )}
        {!isLoading && oportunidades.length === 0 && (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">Nenhuma oportunidade</p>
        )}
        {oportunidades.map((o) => (
          <KanbanCard key={o.id} oportunidade={o} onEdit={onEdit} />
        ))}
      </div>
    </div>
  );
}

function KanbanCard({
  oportunidade,
  onEdit,
}: {
  oportunidade: Oportunidade;
  onEdit: (oportunidade: Oportunidade) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: oportunidade.id,
    data: { estagioAtual: oportunidade.estagio, titulo: oportunidade.titulo },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onEdit(oportunidade)}
      className={`cursor-pointer touch-none rounded-md border bg-background p-2.5 shadow-sm hover:border-primary/50 ${isDragging ? "opacity-50" : ""}`}
    >
      <p className="text-sm font-medium leading-tight">{oportunidade.titulo}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {oportunidade.cliente.nomeFantasia || oportunidade.cliente.razaoSocial}
      </p>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-medium">{moeda(oportunidade.valorPrevisto)}</span>
        <span className="text-muted-foreground">{dataBr(oportunidade.dataPrevisao)}</span>
      </div>
    </div>
  );
}
