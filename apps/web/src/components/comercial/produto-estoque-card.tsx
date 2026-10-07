"use client";

import { useQuery } from "@tanstack/react-query";
import type { EstoqueDetalhe } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Mesmo formato da Consulta de Estoque: duas casas e sem unidade de medida.
const quantidade = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Saldo do produto por armazém (aba Estoque do detalhe). Lê a mesma rota da
 * Consulta de Estoque — só armazéns de revenda —, então quem abre a aba
 * precisa de estoque.visualizar; a tela esconde a aba de quem não tem.
 */
export function ProdutoEstoqueCard({ produtoId }: { produtoId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["estoque", produtoId],
    queryFn: () => apiFetch<EstoqueDetalhe>(`/estoque/${produtoId}`),
    retry: false,
  });

  const saldos = data?.saldos ?? [];
  const total = saldos.reduce((acc, s) => acc + s.saldo, 0);
  const disponivel = saldos.some((s) => s.disponivel != null)
    ? saldos.reduce((acc, s) => acc + (s.disponivel ?? 0), 0)
    : null;
  const reserva = saldos.some((s) => s.reserva != null)
    ? saldos.reduce((acc, s) => acc + (s.reserva ?? 0), 0)
    : null;

  return (
    <Card>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : isError || saldos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem saldo de estoque nos armazéns de revenda.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Resumo rotulo="Saldo" valor={quantidade(total)} destaque />
              <Resumo
                rotulo="Disponível"
                valor={disponivel != null ? quantidade(disponivel) : "—"}
              />
              <Resumo rotulo="Reserva" valor={reserva != null ? quantidade(reserva) : "—"} />
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Armazém</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Disponível</TableHead>
                    <TableHead className="text-right">Reserva</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {saldos.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span>{s.armazem.descricao}</span>
                          {s.armazem.ativo === false && (
                            <Badge
                              variant="outline"
                              className="shrink-0 border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
                            >
                              Bloqueado
                            </Badge>
                          )}
                        </div>
                        {s.armazem.codigoErp && (
                          <p className="font-mono text-xs text-muted-foreground">
                            {s.armazem.codigoErp}
                          </p>
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${s.saldo > 0 ? "" : "text-muted-foreground"}`}
                      >
                        {quantidade(s.saldo)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.disponivel != null ? quantidade(s.disponivel) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.reserva != null ? quantidade(s.reserva) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Resumo({
  rotulo,
  valor,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={`tabular-nums ${destaque ? "text-lg font-semibold" : "text-base"}`}>
        {valor}
      </p>
    </div>
  );
}
