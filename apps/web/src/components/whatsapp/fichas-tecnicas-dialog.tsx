"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileCheck, Search, FileText } from "lucide-react";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ProdutoFichaLinha = {
  id: string;
  titulo: string;
  arquivoNome: string;
  mime: string;
  tamanho: number;
  produto: {
    codigoErp: string;
    descricao: string;
  };
};

export function FichasTecnicasDialog({
  conversaId,
  aberto,
  onOpenChange,
}: {
  conversaId: string;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [escolhida, setEscolhida] = useState<string | null>(null);

  const { data: fichas = [], isLoading } = useQuery<ProdutoFichaLinha[]>({
    queryKey: ["whatsapp-fichas", conversaId, busca],
    queryFn: () =>
      apiFetch<ProdutoFichaLinha[]>(
        `/whatsapp/conversas/${conversaId}/acoes/fichas${busca ? `?busca=${encodeURIComponent(busca)}` : ""}`,
      ),
    enabled: aberto,
  });

  const enviar = useMutation({
    mutationFn: () =>
      apiFetch(`/whatsapp/conversas/${conversaId}/acoes/ficha`, {
        method: "POST",
        body: { fichaId: escolhida },
      }),
    onSuccess: () => {
      toast.success("Ficha técnica enviada na conversa!");
      setEscolhida(null);
      setBusca("");
      onOpenChange(false);
      void queryClient.invalidateQueries({
        queryKey: ["whatsapp-mensagens", conversaId],
      });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Falha ao enviar ficha técnica",
      ),
  });

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="size-5 text-primary" />
            Enviar Ficha Técnica (PDF)
          </DialogTitle>
          <DialogDescription>
            Selecione uma ficha técnica de produto do catálogo para enviar em PDF para o cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por produto ou título da ficha..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8 text-xs h-9"
            />
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1.5 border rounded-md p-1.5">
            {isLoading ? (
              <p className="p-4 text-center text-xs text-muted-foreground">Carregando fichas técnicas...</p>
            ) : fichas.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Nenhuma ficha técnica encontrada.
              </p>
            ) : (
              fichas.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setEscolhida(f.id)}
                  className={cn(
                    "w-full text-left rounded p-2 border transition-colors space-y-1 text-xs",
                    escolhida === f.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-accent/40",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-primary">
                      [{f.produto.codigoErp}] {f.produto.descricao}
                    </span>
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-[11px]">{f.titulo} ({f.arquivoNome})</p>
                </button>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={!escolhida || enviar.isPending}
            onClick={() => enviar.mutate()}
          >
            {enviar.isPending ? "Enviando PDF..." : "Enviar Ficha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
