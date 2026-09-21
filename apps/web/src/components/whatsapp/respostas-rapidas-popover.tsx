"use client";

import { useQuery } from "@tanstack/react-query";
import { Zap, Settings } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

export type WhatsappRespostaRapida = {
  id: string;
  empresaId: string;
  atalho: string;
  titulo: string;
  conteudo: string;
};

export function RespostasRapidasPopover({
  filtro,
  onSelecionar,
  onAbrirGerenciador,
}: {
  filtro: string;
  onSelecionar: (conteudo: string) => void;
  onAbrirGerenciador: () => void;
}) {
  const { data: respostas = [] } = useQuery<WhatsappRespostaRapida[]>({
    queryKey: ["whatsapp-respostas-rapidas"],
    queryFn: () => apiFetch<WhatsappRespostaRapida[]>("/whatsapp/respostas-rapidas"),
  });

  const termo = filtro.trim().toLowerCase();
  const filtradas = respostas.filter(
    (r) =>
      r.atalho.toLowerCase().includes(termo) ||
      r.titulo.toLowerCase().includes(termo) ||
      r.conteudo.toLowerCase().includes(termo),
  );

  return (
    <div className="absolute bottom-full left-0 mb-2 w-80 max-h-64 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md z-50 p-1 space-y-1">
      <div className="flex items-center justify-between border-b px-2 py-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1 font-medium">
          <Zap className="size-3 text-amber-500" />
          Respostas Rápidas ({filtradas.length})
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-5"
          onClick={onAbrirGerenciador}
          title="Gerenciar atalhos"
        >
          <Settings className="size-3" />
        </Button>
      </div>

      {filtradas.length === 0 ? (
        <div className="p-3 text-center text-xs text-muted-foreground">
          Nenhuma resposta rápida encontrada para &quot;/{filtro}&quot;.
        </div>
      ) : (
        filtradas.map((r) => (
          <button
            key={r.id}
            type="button"
            className="w-full text-left rounded px-2 py-1.5 hover:bg-accent text-xs space-y-0.5"
            onClick={() => onSelecionar(r.conteudo)}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-primary">/{r.atalho}</span>
              <span className="text-[10px] text-muted-foreground truncate">{r.titulo}</span>
            </div>
            <p className="line-clamp-2 text-muted-foreground text-[11px]">{r.conteudo}</p>
          </button>
        ))
      )}
    </div>
  );
}
