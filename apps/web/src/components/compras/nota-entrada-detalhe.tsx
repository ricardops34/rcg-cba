"use client";

import { useQuery } from "@tanstack/react-query";
import type { NotaEntrada, NotaEntradaItem } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { dataCivilBr } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type NotaEntradaDetalhe = NotaEntrada & {
  fornecedor?: {
    id: string;
    codigoErp: string | null;
    razaoSocial: string;
    nomeFantasia: string | null;
  } | null;
  cliente?: {
    id: string;
    codigoErp: string | null;
    razaoSocial: string;
    nomeFantasia: string | null;
  } | null;
  condicaoPagamento?: { id: string; descricao: string } | null;
  itens: Array<
    NotaEntradaItem & {
      produto?: { id: string; codigoErp: string; descricao: string; unidade: string | null } | null;
      armazem?: { id: string; codigoErp: string; descricao: string } | null;
    }
  >;
};

const moeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const dataBr = dataCivilBr;

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}

/**
 * Corpo do detalhe de uma nota de entrada. Sem os botões de 2ª via da nota de
 * saída: o documento de entrada é do fornecedor, e não é a plataforma que o
 * reimprime.
 */
export function NotaEntradaDetalheContent({ nota }: { nota: NotaEntradaDetalhe }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Emissão" value={dataBr(nota.dtEmissao)} />
          <Info label="Entrada" value={dataBr(nota.dtEntrada)} />
          <Info label="Espécie" value={nota.especieFiscal || "—"} />
          {nota.cliente ? (
            // Devolução de venda: quem devolve é o cliente
            <Info
              label="Cliente (devolução)"
              value={nota.cliente.nomeFantasia || nota.cliente.razaoSocial}
            />
          ) : (
            <Info
              label="Fornecedor"
              value={
                nota.fornecedor
                  ? nota.fornecedor.nomeFantasia || nota.fornecedor.razaoSocial
                  : "—"
              }
            />
          )}
          <Info label="Condição de pagamento" value={nota.condicaoPagamento?.descricao ?? "—"} />
          <Info label="Vlr. mercadoria" value={moeda(nota.vlrMercadoria)} />
          <Info label="Vlr. itens" value={moeda(nota.vlrItens)} />
          <Info label="Vlr. bruto" value={moeda(nota.vlrBruto)} />
          <Info label="Desconto" value={moeda(nota.vlrDesconto)} />
          <Info label="ICMS" value={moeda(nota.vlrIcms)} />
          <Info label="ICMS ST" value={moeda(nota.vlrIcmsSt)} />
          <Info label="IPI" value={moeda(nota.vlrIpi)} />
          <Info label="Frete" value={moeda(nota.vlrFrete)} />
          <Info label="Seguro" value={moeda(nota.vlrSeguro)} />
          <Info label="Despesas" value={moeda(nota.vlrDespesa)} />
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
                  <TableHead className="text-right">IPI</TableHead>
                  <TableHead className="text-right">ICMS ST</TableHead>
                  <TableHead>Armazém</TableHead>
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
                    <TableCell className="text-right">{moeda(it.vlrIpi)}</TableCell>
                    <TableCell className="text-right">{moeda(it.vlrIcmsSt)}</TableCell>
                    <TableCell className="text-xs">{it.armazem?.descricao || "—"}</TableCell>
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

/**
 * Cortina lateral com o detalhe da nota de entrada — a aba Devoluções da
 * Posição de Cliente abre por aqui, como a nota de saída abre na
 * `NotaSaidaSheet`, sem tirar quem consulta da posição.
 */
export function NotaEntradaSheet({
  id,
  onOpenChange,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: nota, isLoading, isError } = useQuery({
    queryKey: ["notas-entrada", id],
    queryFn: () => apiFetch<NotaEntradaDetalhe>(`/notas-entrada/${id}`),
    enabled: !!id,
  });

  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <ResizableSheetContent defaultWidth={720}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {nota ? (
              <>
                Nota {nota.numero}
                {nota.serie ? `/${nota.serie}` : ""}
                {nota.tipo === "D" && <Badge variant="outline">Devolução</Badge>}
                {!nota.ativo && <Badge variant="destructive">Inativa</Badge>}
              </>
            ) : (
              "Nota fiscal de entrada"
            )}
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          )}
          {isError && <p className="text-sm text-muted-foreground">Nota de entrada não encontrada.</p>}
          {nota && <NotaEntradaDetalheContent nota={nota} />}
        </div>
      </ResizableSheetContent>
    </Sheet>
  );
}
