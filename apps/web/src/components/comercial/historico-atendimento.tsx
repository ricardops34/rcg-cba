"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { Atividade } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { TIPO_COR, TIPO_LABEL } from "@/components/crud/atividade-tipo";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Quantas atividades a aba mostra; o resto fica em CRM › Atividades. */
const LIMITE = 100;

const dataHora = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

/**
 * Aba "Histórico de atendimento" da Posição do Cliente (pedido do usuário,
 * 01/10/2026): tudo o que foi feito pelo cliente — visitas, ligações,
 * propostas, 2ª via e cobrança enviadas por WhatsApp ou e-mail — mais recente
 * primeiro.
 *
 * É a mesma consulta de CRM › Atividades filtrada pelo cliente: o histórico
 * mora num lugar só (ver `registrar-atividade-documento.ts`), e a carteira de
 * quem consulta vale aqui como lá.
 */
export function HistoricoAtendimento({ clienteId }: { clienteId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["atividades", "cliente", clienteId, "historico"],
    queryFn: () =>
      apiFetch<{ data: Atividade[]; total: number }>("/atividades", {
        query: {
          clienteId,
          page: 1,
          pageSize: LIMITE,
          sortBy: "createdAt",
          sortOrder: "desc",
        },
      }),
  });

  const atividades = data?.data ?? [];

  return (
    <Card>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar o histórico.</p>
        ) : atividades.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum atendimento registrado para este cliente.
          </p>
        ) : (
          <>
            <ol className="max-h-[520px] space-y-0 overflow-y-auto rounded-lg border">
              {atividades.map((a) => {
                const quando = a.concluida
                  ? a.dataConclusao ?? a.createdAt
                  : a.dataVencimento ?? a.createdAt;
                return (
                  <li
                    key={a.id}
                    className="flex gap-3 border-t px-3 py-2.5 first:border-t-0"
                  >
                    <span
                      className={`mt-1.5 size-2.5 shrink-0 rounded-full ${TIPO_COR[a.tipo]}`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <Link
                          href={`/crm/atividades/${a.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {a.titulo}
                        </Link>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {dataHora(quando)}
                        </span>
                      </div>
                      {a.descricao && (
                        <p className="text-xs break-words text-muted-foreground">{a.descricao}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {TIPO_LABEL[a.tipo]}
                        {" · "}
                        {a.concluida ? "Concluída" : "Pendente"}
                        {" · "}
                        {a.vendedor.nomeReduzido || a.vendedor.nome}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
            {(data?.total ?? 0) > atividades.length && (
              <p className="text-xs text-muted-foreground">
                Mostrando os {atividades.length} mais recentes de {data?.total}. O histórico
                completo está em{" "}
                <Link href="/crm/atividades" className="underline">
                  CRM › Atividades
                </Link>
                .
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
