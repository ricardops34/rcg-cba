"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { NotaSaida, NotaSaidaItem } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
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
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/comercial/notas-saida";

type NotaDetalhe = NotaSaida & {
  cliente?: { id: string; codigoErp: string | null; razaoSocial: string } | null;
  vendedor?: { id: string; nome: string; nomeReduzido: string | null } | null;
  condicaoPagamento?: { id: string; descricao: string } | null;
  itens: Array<
    NotaSaidaItem & {
      produto?: { id: string; codigoErp: string; descricao: string; unidade: string | null } | null;
    }
  >;
};

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

// Detalhe read-only: os dados entram pelo import do ERP.
export default function NotaSaidaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: nota, isLoading, isError } = useQuery({
    queryKey: ["notas-saida", id],
    queryFn: () => apiFetch<NotaDetalhe>(`/notas-saida/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !nota) {
    return <p className="text-sm text-muted-foreground">Nota de saída não encontrada.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          Nota {nota.numero}
          {nota.serie ? `/${nota.serie}` : ""}
        </h1>
        {nota.comodato && <Badge variant="outline">Comodato</Badge>}
        {!nota.ativo && <Badge variant="destructive">Inativa</Badge>}
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Info label="Emissão" value={dataBr(nota.dtEmissao)} />
          <Info label="Espécie" value={nota.especieFiscal || "—"} />
          <Info label="Cliente" value={nota.cliente?.razaoSocial ?? "—"} />
          <Info
            label="Vendedor"
            value={nota.vendedor ? nota.vendedor.nomeReduzido || nota.vendedor.nome : "—"}
          />
          <Info label="Condição de pagamento" value={nota.condicaoPagamento?.descricao ?? "—"} />
          <Info label="Vlr. mercadoria" value={moeda(nota.vlrMercadoria)} />
          <Info label="Vlr. itens" value={moeda(nota.vlrItens)} />
          <Info label="Vlr. bruto" value={moeda(nota.vlrBruto)} />
          <Info label="Desconto" value={moeda(nota.vlrDesconto)} />
          <Info label="ICMS" value={moeda(nota.vlrIcms)} />
          <Info label="IPI" value={moeda(nota.vlrIpi)} />
          <Info label="Frete" value={moeda(nota.vlrFrete)} />
          {nota.chaveNfe && (
            <div className="col-span-2 sm:col-span-4">
              <p className="text-xs text-muted-foreground">Chave NFe</p>
              <p className="font-mono text-xs">{nota.chaveNfe}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <p className="mb-3 text-sm font-medium">Itens ({nota.itens.length})</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Vlr. unit.</TableHead>
                  <TableHead className="text-right">Desconto</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>CFOP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nota.itens.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="text-muted-foreground">{it.item ?? "—"}</TableCell>
                    <TableCell>
                      <p>{it.produto?.descricao ?? "—"}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {it.produto?.codigoErp}
                      </p>
                    </TableCell>
                    <TableCell className="text-right">
                      {it.quantidade.toLocaleString("pt-BR")}
                      {it.produto?.unidade && (
                        <span className="text-xs text-muted-foreground"> {it.produto.unidade}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{moeda(it.vlrUnitario)}</TableCell>
                    <TableCell className="text-right">{moeda(it.vlrDesconto)}</TableCell>
                    <TableCell className="text-right">{moeda(it.vlrTotal)}</TableCell>
                    <TableCell className="font-mono text-xs">{it.cfop || "—"}</TableCell>
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
