"use client";

import { useQuery } from "@tanstack/react-query";
import type { Atividade } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { TIPO_COR, TIPO_LABEL } from "@/components/crud/atividade-tipo";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Histórico de atendimentos do cliente em linha do tempo — mostra tudo que
 * aconteceu até chegar neste orçamento (ligações, visitas, reuniões...), com
 * destaque para as atividades vinculadas ao próprio orçamento (ex.: o retorno
 * gerado automaticamente pela data de retorno).
 *
 * Ordena pela data que de fato representa o atendimento: vencimento quando
 * houver (é a data que o vendedor agendou/registrou), senão a criação.
 */

const dataDoEvento = (a: Atividade) => new Date(a.dataVencimento ?? a.createdAt);

const diaBr = (d: Date) => d.toLocaleDateString("pt-BR");
/** Hora só quando informada — atividade de dia inteiro fica gravada em 00:00. */
const horaBr = (d: Date) =>
  d.getHours() === 0 && d.getMinutes() === 0
    ? null
    : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function OrcamentoTimeline({
  clienteId,
  orcamentoId,
}: {
  clienteId: string;
  /**
   * Atividades deste orçamento ganham destaque na linha. Ausente enquanto o
   * orçamento ainda não foi gravado — o histórico do cliente já vale antes.
   */
  orcamentoId?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["atividades", "timeline", clienteId],
    queryFn: () =>
      apiFetch<{ data: Atividade[] }>("/atividades", {
        query: { clienteId, pageSize: 100, sortBy: "dataVencimento", sortOrder: "asc" },
      }),
    enabled: !!clienteId,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const atividades = [...(data?.data ?? [])].sort(
    (a, b) => dataDoEvento(a).getTime() - dataDoEvento(b).getTime(),
  );

  if (atividades.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum atendimento registrado para este cliente ainda.
      </p>
    );
  }

  return (
    <div className="relative py-1">
      {/* Trilho vertical central da linha do tempo. */}
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />

      <div className="space-y-3">
        {atividades.map((a, index) => {
          const data = dataDoEvento(a);
          const dia = diaBr(data);
          const hora = horaBr(data);
          // Separador de data só quando o dia muda em relação à linha anterior.
          const anterior = index > 0 ? atividades[index - 1] : null;
          const novoDia = !anterior || diaBr(dataDoEvento(anterior)) !== dia;
          const desteOrcamento = !!orcamentoId && a.orcamentoId === orcamentoId;
          // Alterna os lados como num "zig-zag" clássico de timeline.
          const aEsquerda = index % 2 === 0;

          return (
            <div key={a.id}>
              {novoDia && (
                <div className="relative flex justify-center py-2">
                  <span className="rounded-full border border-border/70 bg-background px-2.5 py-0.5 text-xs font-medium">
                    {dia}
                  </span>
                </div>
              )}

              <div className="relative flex items-start gap-3">
                {/* Metade esquerda: o cartão só ocupa quando é a vez dela. */}
                <div className="flex-1">
                  {aEsquerda && (
                    <Cartao atividade={a} hora={hora} destaque={desteOrcamento} alinhar="right" />
                  )}
                </div>

                {/* Marcador sobre o trilho, colorido pelo tipo da atividade. */}
                <span
                  className={cn(
                    "mt-3 flex size-5 shrink-0 items-center justify-center rounded-full text-white ring-4 ring-background",
                    TIPO_COR[a.tipo],
                  )}
                  title={TIPO_LABEL[a.tipo]}
                >
                  {a.concluida ? (
                    <CheckCircle2 className="size-3" />
                  ) : (
                    <Clock className="size-3" />
                  )}
                </span>

                <div className="flex-1">
                  {!aEsquerda && (
                    <Cartao atividade={a} hora={hora} destaque={desteOrcamento} alinhar="left" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Cartao({
  atividade,
  hora,
  destaque,
  alinhar,
}: {
  atividade: Atividade;
  hora: string | null;
  /** Atividade vinculada ao orçamento aberto — fica com borda de destaque. */
  destaque: boolean;
  alinhar: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        destaque ? "border-primary/40 bg-primary/5" : "border-border/70 bg-card",
        alinhar === "right" && "text-right",
      )}
    >
      <div
        className={cn(
          "flex items-baseline gap-2",
          alinhar === "right" ? "flex-row-reverse" : "flex-row",
        )}
      >
        <p className="flex-1 truncate text-sm font-medium">{atividade.titulo}</p>
        {hora && <span className="text-xs text-muted-foreground">{hora}</span>}
      </div>

      {atividade.descricao && (
        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{atividade.descricao}</p>
      )}

      <div
        className={cn(
          "mt-1.5 flex flex-wrap items-center gap-1.5",
          alinhar === "right" && "justify-end",
        )}
      >
        <Badge variant="outline">{TIPO_LABEL[atividade.tipo]}</Badge>
        {atividade.concluida && <Badge variant="outline">Concluída</Badge>}
        {destaque && <Badge>Deste orçamento</Badge>}
        <span className="text-xs text-muted-foreground">
          {atividade.vendedor.nomeReduzido || atividade.vendedor.nome}
        </span>
      </div>
    </div>
  );
}
