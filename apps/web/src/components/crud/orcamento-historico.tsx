"use client";

import { useQuery } from "@tanstack/react-query";
import type { HistoricoOrcamentoEvento } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const dataHora = (v: string) => new Date(v).toLocaleString("pt-BR");

/**
 * Histórico completo do orçamento, do mais recente ao mais antigo: o quê, quem,
 * quando e o detalhe (campos alterados, justificativa, canal da decisão). Fica
 * na aba Histórico, acima da linha do tempo do cliente — que continua lá para o
 * contexto do atendimento.
 *
 * A chave começa por "atividades" porque é isso que o formulário invalida
 * depois de salvar, gerar PDF ou decidir o desconto.
 */
export function OrcamentoHistorico({ orcamentoId }: { orcamentoId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["atividades", "orcamento", orcamentoId],
    queryFn: () => apiFetch<HistoricoOrcamentoEvento[]>(`/orcamentos/${orcamentoId}/historico`),
  });

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
        </li>
      ))}
    </ol>
  );
}
