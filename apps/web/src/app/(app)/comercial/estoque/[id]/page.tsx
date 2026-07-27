"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { EstoqueDetalhe } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
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
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/comercial/estoque";

const moeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const dataBr = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}

// Detalhe read-only: abre o saldo do produto por armazém.
export default function EstoqueDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: detalhe, isLoading, isError } = useQuery({
    queryKey: ["estoque", id],
    queryFn: () => apiFetch<EstoqueDetalhe>(`/estoque/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !detalhe) {
    return <p className="text-sm text-muted-foreground">Produto não encontrado.</p>;
  }

  const { produto, saldos } = detalhe;
  const saldoTotal = saldos.reduce((acc, s) => acc + s.saldo, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{produto.descricao}</h1>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Info label="Código ERP" value={produto.codigoErp} />
          <Info label="Unidade" value={produto.unidade || "—"} />
          <Info label="Categoria" value={produto.categoria?.descricao ?? "—"} />
          <Info label="Saldo total" value={saldoTotal.toLocaleString("pt-BR")} />
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
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-right">Últ. preço</TableHead>
                  <TableHead>Últ. compra</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {saldos.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <p>{s.armazem.descricao}</p>
                      {s.armazem.codigoErp && (
                        <p className="font-mono text-xs text-muted-foreground">{s.armazem.codigoErp}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={s.saldo > 0 ? "" : "text-muted-foreground"}>
                        {s.saldo.toLocaleString("pt-BR")}
                        {produto.unidade && <span className="text-xs text-muted-foreground"> {produto.unidade}</span>}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {s.reserva != null ? s.reserva.toLocaleString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-right">{moeda(s.custo)}</TableCell>
                    <TableCell className="text-right">{moeda(s.ultimoPreco)}</TableCell>
                    <TableCell>{dataBr(s.ultimaCompra)}</TableCell>
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
