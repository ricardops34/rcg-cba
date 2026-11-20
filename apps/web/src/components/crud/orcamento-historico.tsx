"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, MapPinOff } from "lucide-react";
import {
  LOCALIZACAO_MOTIVO_ROTULO,
  type HistoricoOrcamentoEvento,
} from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { MapaLocal } from "@/components/mapa/mapa-local";

const dataHora = (v: string) => new Date(v).toLocaleString("pt-BR");

/**
 * Histórico completo do orçamento, do mais recente ao mais antigo: o quê, quem,
 * quando e o detalhe (campos alterados, justificativa, canal da decisão). Fica
 * na aba Histórico, acima da linha do tempo do cliente — que continua lá para o
 * contexto do atendimento.
 *
 * Criação, alteração, decisão e desconto mostram onde o dispositivo de quem
 * agiu estava (20/11/2026), com o mapa a um clique.
 *
 * A chave começa por "atividades" porque é isso que o formulário invalida
 * depois de salvar, gerar PDF ou decidir o desconto.
 */
export function OrcamentoHistorico({ orcamentoId }: { orcamentoId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["atividades", "orcamento", orcamentoId],
    queryFn: () => apiFetch<HistoricoOrcamentoEvento[]>(`/orcamentos/${orcamentoId}/historico`),
  });
  const [noMapa, setNoMapa] = useState<HistoricoOrcamentoEvento | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Nada registrado neste orçamento ainda.</p>;
  }

  return (
    <>
      <ol className="divide-y rounded-lg border">
        {data.map((e) => (
          <li key={e.id} className="space-y-0.5 px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium">{e.titulo}</span>
              {e.pendente && <Badge variant="warning">Em aberto</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {e.por} · {dataHora(e.em)}
            </p>
            {e.detalhe && (
              <p className="whitespace-pre-line break-words text-sm text-muted-foreground">
                {e.detalhe}
              </p>
            )}
            {e.localizacao &&
              (e.localizacao.latitude != null ? (
                <button
                  type="button"
                  onClick={() => setNoMapa(e)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <MapPin className="size-3.5" />
                  Feito em {e.localizacao.latitude}, {e.localizacao.longitude}
                  {e.localizacao.precisao != null && ` (±${Math.round(e.localizacao.precisao)} m)`}
                  {" · ver no mapa"}
                </button>
              ) : (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPinOff className="size-3.5" />
                  Sem localização:{" "}
                  {LOCALIZACAO_MOTIVO_ROTULO[e.localizacao.motivo ?? ""] ?? e.localizacao.motivo}
                </p>
              ))}
          </li>
        ))}
      </ol>

      <Dialog open={!!noMapa} onOpenChange={(aberto) => !aberto && setNoMapa(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogTitle>{noMapa?.titulo}</DialogTitle>
          <p className="-mt-2 text-xs text-muted-foreground">
            {noMapa?.por} · {noMapa ? dataHora(noMapa.em) : ""}
            {noMapa?.localizacao?.precisao != null &&
              ` · precisão de ${Math.round(noMapa.localizacao.precisao)} m informada pelo dispositivo`}
          </p>
          {noMapa?.localizacao?.latitude != null && (
            <MapaLocal
              rotulo={`${noMapa.titulo} — ${noMapa.por}`}
              latitude={noMapa.localizacao.latitude}
              longitude={noMapa.localizacao.longitude}
              podeEditar={false}
              onGravar={() => undefined}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
