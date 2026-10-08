"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { StickyNote } from "lucide-react";
import type { WhatsappEventoAtendimento } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Anotação interna na conversa: fica na linha do tempo e no Histórico do
 * WhatsApp, e **não vai ao cliente** — a API grava como evento da conversa,
 * sem passar pelo provedor.
 */
export function AnotacaoDialog({
  conversaId,
  aberto,
  onOpenChange,
}: {
  conversaId: string;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const empresaId = useAuthStore((s) => s.user?.empresaAtivaId);
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState("");

  const anotar = useMutation({
    mutationFn: () =>
      apiFetch<WhatsappEventoAtendimento[]>(
        `/whatsapp/conversas/${conversaId}/anotacoes`,
        { method: "POST", body: { texto: texto.trim() } },
      ),
    onSuccess: (eventos) => {
      // A resposta já é a linha de eventos atualizada: a nota aparece na hora.
      queryClient.setQueryData(["whatsapp-eventos", empresaId, conversaId], eventos);
      setTexto("");
      onOpenChange(false);
      toast.success("Anotação adicionada");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao salvar a anotação"),
  });

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="size-4 text-amber-600" /> Anotação interna
          </DialogTitle>
          <DialogDescription>
            Fica na conversa e no histórico, para você e a equipe. O cliente não
            recebe.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          rows={5}
          maxLength={2000}
          placeholder="Ex.: cliente pediu retorno depois do dia 15."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => anotar.mutate()}
            disabled={!texto.trim() || anotar.isPending}
          >
            {anotar.isPending ? "Salvando…" : "Adicionar anotação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
