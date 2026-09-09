"use client";

import type { NotaEntrada, NotaEntradaItem } from "@plataforma/contracts";
import { Card, CardContent } from "@/components/ui/card";
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
          <Info
            label="Fornecedor"
            value={
              nota.fornecedor
                ? nota.fornecedor.nomeFantasia || nota.fornecedor.razaoSocial
                : "—"
            }
          />
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
