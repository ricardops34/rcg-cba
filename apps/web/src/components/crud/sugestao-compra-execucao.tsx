"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import type { SugestaoCompraExecucao } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";

const hora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

/**
 * Andamento do "Calcular" em lote, que corre em segundo plano. Enquanto roda,
 * pergunta de novo a cada 5 s; quando termina, chama `onConcluida` para a
 * lista recarregar. Fora disso, não fica consultando.
 */
export function useExecucaoSugestao(onConcluida: () => void) {
  const query = useQuery({
    queryKey: ["sugestao-compra", "execucao"],
    queryFn: () => apiFetch<SugestaoCompraExecucao | null>("/sugestao-compra/execucoes/ultima"),
    refetchInterval: (q) => (q.state.data?.situacao === "rodando" ? 5000 : false),
  });
  const execucao = query.data ?? null;
  const anterior = useRef<string | null>(null);
  const concluida = useRef(onConcluida);
  useEffect(() => {
    concluida.current = onConcluida;
  });
  useEffect(() => {
    const chave = execucao ? `${execucao.id}:${execucao.situacao}` : null;
    const eraRodando = anterior.current?.endsWith(":rodando") ?? false;
    anterior.current = chave;
    if (!execucao || !eraRodando || execucao.situacao === "rodando") return;
    if (execucao.situacao === "concluida") {
      toast.success("Cálculo da sugestão de compra concluído");
      concluida.current();
    } else {
      toast.error("O cálculo da sugestão de compra falhou");
    }
  }, [execucao]);
  return { execucao, rodando: execucao?.situacao === "rodando", refetch: query.refetch };
}

export function SugestaoCompraExecucaoFaixa({ execucao }: { execucao: SugestaoCompraExecucao | null }) {
  if (!execucao) return null;
  const quem = execucao.usuarioNome ? ` por ${execucao.usuarioNome}` : "";
  if (execucao.situacao === "rodando") {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <Loader2 className="size-4 animate-spin text-primary" />
        Calculando sugestões em segundo plano (iniciado em {hora(execucao.iniciadaEm)}{quem}). Pode continuar usando o
        sistema; a lista atualiza sozinha ao terminar.
      </div>
    );
  }
  if (execucao.situacao === "falhou") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
        <CircleAlert className="size-4 text-destructive" />
        O último cálculo ({hora(execucao.iniciadaEm)}{quem}) falhou{execucao.erro ? `: ${execucao.erro}` : ""}. Tente
        de novo em Calcular.
      </div>
    );
  }
  const r = execucao.resultado;
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
      <CircleCheck className="size-3.5" />
      Último cálculo em {hora(execucao.concluidaEm ?? execucao.iniciadaEm)}{quem}
      {r ? ` · ${r.clientesComSugestao} de ${r.clientesProcessados} cliente(s) com sugestão` : ""}
    </div>
  );
}
