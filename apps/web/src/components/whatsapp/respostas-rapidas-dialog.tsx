"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Zap } from "lucide-react";
import { ApiError, apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WhatsappRespostaRapida } from "./respostas-rapidas-popover";

export function RespostasRapidasDialog({
  aberto,
  onOpenChange,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<WhatsappRespostaRapida | null>(null);
  const [criando, setCriando] = useState(false);

  const [atalho, setAtalho] = useState("");
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");

  const chaveQuery = ["whatsapp-respostas-rapidas"];

  const { data: respostas = [] } = useQuery<WhatsappRespostaRapida[]>({
    queryKey: chaveQuery,
    queryFn: () => apiFetch<WhatsappRespostaRapida[]>("/whatsapp/respostas-rapidas"),
    enabled: aberto,
  });

  const invalidar = () => void queryClient.invalidateQueries({ queryKey: chaveQuery });

  const salvar = useMutation({
    mutationFn: () => {
      const body = { atalho, titulo, conteudo };
      if (editando) {
        return apiFetch(`/whatsapp/respostas-rapidas/${editando.id}`, {
          method: "PUT",
          body,
        });
      }
      return apiFetch("/whatsapp/respostas-rapidas", {
        method: "POST",
        body,
      });
    },
    onSuccess: () => {
      toast.success(editando ? "Resposta rápida atualizada" : "Resposta rápida criada");
      resetarForm();
      invalidar();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao salvar resposta rápida"),
  });

  const excluir = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/whatsapp/respostas-rapidas/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Resposta rápida excluída");
      invalidar();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Falha ao excluir resposta rápida"),
  });

  const resetarForm = () => {
    setCriando(false);
    setEditando(null);
    setAtalho("");
    setTitulo("");
    setConteudo("");
  };

  const iniciarEdicao = (r: WhatsappRespostaRapida) => {
    setEditando(r);
    setCriando(false);
    setAtalho(r.atalho);
    setTitulo(r.titulo);
    setConteudo(r.conteudo);
  };

  const iniciarCriacao = () => {
    setEditando(null);
    setCriando(true);
    setAtalho("");
    setTitulo("");
    setConteudo("");
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-5 text-amber-500" />
            Respostas Rápidas (Atalhos)
          </DialogTitle>
          <DialogDescription>
            Cadastre mensagens padrão ativadas pela barra de atalho (ex: /pix).
          </DialogDescription>
        </DialogHeader>

        {criando || editando ? (
          <div className="space-y-3 rounded-md border p-3 bg-muted/20">
            <p className="text-xs font-semibold">
              {editando ? "Editar resposta rápida" : "Nova resposta rápida"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Atalho (sem /)</label>
                <Input
                  placeholder="pix"
                  value={atalho}
                  onChange={(e) => setAtalho(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Título</label>
                <Input
                  placeholder="Chave PIX e dados de depósito"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">Conteúdo da mensagem</label>
              <Textarea
                placeholder="Olá! Seguem os nossos dados de PIX..."
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
                rows={3}
                className="text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={resetarForm}>
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!atalho.trim() || !titulo.trim() || !conteudo.trim() || salvar.isPending}
                onClick={() => salvar.mutate()}
              >
                {salvar.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-muted-foreground">Atalhos cadastrados</span>
              <Button type="button" size="sm" variant="outline" onClick={iniciarCriacao} className="gap-1">
                <Plus className="size-3.5" />
                Novo atalho
              </Button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 border rounded-md p-1.5">
              {respostas.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  Nenhuma resposta rápida cadastrada. Clique em &quot;Novo atalho&quot; para criar.
                </p>
              ) : (
                respostas.map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-2 p-2 rounded border hover:bg-accent/40 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-primary">/{r.atalho}</span>
                        <span className="text-muted-foreground truncate">{r.titulo}</span>
                      </div>
                      <p className="line-clamp-2 text-muted-foreground text-[11px] mt-0.5">{r.conteudo}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={() => iniciarEdicao(r)}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 text-destructive"
                        onClick={() => excluir.mutate(r.id)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
