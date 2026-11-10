"use client";

import { useQuery } from "@tanstack/react-query";
import type { HistoricoDescontoEvento } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Field, FieldLabel } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ROTULO: Record<HistoricoDescontoEvento["evento"], string> = {
  solicitada: "Liberação solicitada",
  autorizada: "Desconto autorizado",
  recusada: "Desconto recusado",
};

const COR: Record<HistoricoDescontoEvento["evento"], string> = {
  solicitada: "text-amber-700 dark:text-amber-400",
  autorizada: "text-emerald-700 dark:text-emerald-400",
  recusada: "text-destructive",
};

const dataHora = (v: string) => new Date(v).toLocaleString("pt-BR");

/**
 * Autorização de desconto na aba "Aprovação e integração": cada pedido,
 * liberação e recusa, com quem fez, quando e a justificativa. Todas as
 * rodadas, não só a atual — a recusa limpa o pedido no orçamento, mas o
 * rastro fica aqui. Recarrega com as ações (invalidam a chave "orcamentos").
 */
export function useHistoricoDesconto(orcamentoId: string | undefined, habilitado = true) {
  return useQuery({
    queryKey: ["orcamentos", orcamentoId, "historico-desconto"],
    enabled: !!orcamentoId && habilitado,
    queryFn: () =>
      apiFetch<HistoricoDescontoEvento[]>(`/orcamentos/${orcamentoId}/historico-desconto`),
  });
}

/** Último evento de uma etapa — "por Fulano: justificativa" no aviso do topo. */
export function ultimoEvento(
  historico: HistoricoDescontoEvento[] | undefined,
  evento: HistoricoDescontoEvento["evento"],
) {
  return [...(historico ?? [])].reverse().find((e) => e.evento === evento);
}

export function OrcamentoHistoricoDesconto({ orcamentoId }: { orcamentoId: string }) {
  const { data = [], isLoading } = useHistoricoDesconto(orcamentoId);
  if (isLoading || data.length === 0) return null;

  return (
    <Field>
      <FieldLabel>Autorização de desconto</FieldLabel>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Etapa</TableHead>
            <TableHead>Por</TableHead>
            <TableHead>Data e hora</TableHead>
            <TableHead>Justificativa</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((e, i) => (
            <TableRow key={`${e.em}-${i}`}>
              <TableCell className={`whitespace-nowrap font-medium ${COR[e.evento]}`}>
                {ROTULO[e.evento]}
              </TableCell>
              <TableCell className="whitespace-nowrap">{e.por ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{dataHora(e.em)}</TableCell>
              <TableCell className="min-w-48 whitespace-normal break-words">
                {e.justificativa ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Field>
  );
}
