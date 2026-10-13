"use client";

import { useQuery } from "@tanstack/react-query";
import type { EstoqueDetalhe } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Saldo sempre com duas casas e sem unidade de medida: o número é o que o ERP
// guarda, e a unidade do cadastro confundia (produto "5KG" com saldo "3 KG").
const quantidade = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}

/** Selo de bloqueado do produto, ao lado do título. */
export function EstoqueBloqueadoBadge() {
  return (
    <Badge
      variant="outline"
      className="border-amber-500/40 bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400"
    >
      Bloqueado
    </Badge>
  );
}

/**
 * Corpo do detalhe do estoque — o saldo do produto por armazém. Usado na
 * página cheia e na cortina que a lista abre.
 */
export function EstoqueDetalheConteudo({ detalhe }: { detalhe: EstoqueDetalhe }) {
  const { produto, saldos } = detalhe;
  const saldoTotal = saldos.reduce((acc, s) => acc + s.saldo, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Código ERP" value={produto.codigoErp} />
          <Info label="Categoria" value={produto.categoria?.descricao ?? "—"} />
          <Info label="Saldo total" value={quantidade(saldoTotal)} />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <p className="mb-3 text-sm font-medium">Saldo por armazém ({saldos.length})</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Armazém</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Reserva</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {saldos.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <p>{s.armazem.descricao}</p>
                        {!s.armazem.ativo && (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400 shrink-0"
                          >
                            Bloqueado
                          </Badge>
                        )}
                      </div>
                      {s.armazem.codigoErp && (
                        <p className="font-mono text-xs text-muted-foreground">{s.armazem.codigoErp}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={s.saldo > 0 ? "" : "text-muted-foreground"}>
                        {quantidade(s.saldo)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {s.reserva != null ? quantidade(s.reserva) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Cortina com o saldo do produto por armazém, por cima da Consulta de
 * Estoque — o mesmo padrão de Produtos e Posição de Cliente: a lista fica por
 * baixo com busca, filtros e página intactos.
 */
export function EstoqueSheet({
  id,
  onOpenChange,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: detalhe, isLoading, isError } = useQuery({
    queryKey: ["estoque", id],
    queryFn: () => apiFetch<EstoqueDetalhe>(`/estoque/${id}`),
    enabled: !!id,
  });

  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <ResizableSheetContent
        defaultWidth={720}
        storageKey="plataforma-cortina-largura-estoque"
      >
        <SheetHeader className="pr-10">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-lg leading-snug">
              {detalhe?.produto.descricao ?? "Estoque"}
            </SheetTitle>
            {detalhe && !detalhe.produto.ativo && <EstoqueBloqueadoBadge />}
          </div>
          <SheetDescription className="sr-only">Saldo do produto por armazém</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          {isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
          {isError && <p className="text-sm text-muted-foreground">Produto não encontrado.</p>}
          {detalhe && <EstoqueDetalheConteudo detalhe={detalhe} />}
        </div>
      </ResizableSheetContent>
    </Sheet>
  );
}
