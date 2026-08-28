"use client";

import { useQuery } from "@tanstack/react-query";
import type { NotaSaida, NotaSaidaItem } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { regraDescontoLabel } from "@/lib/regra-desconto";
import { useAuthStore } from "@/stores/auth-store";
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

export type NotaSaidaDetalhe = NotaSaida & {
  cliente?: { id: string; codigoErp: string | null; razaoSocial: string } | null;
  vendedor?: { id: string; nome: string; nomeReduzido: string | null } | null;
  condicaoPagamento?: { id: string; descricao: string } | null;
  itens: Array<
    NotaSaidaItem & {
      produto?: { id: string; codigoErp: string; descricao: string; unidade: string | null } | null;
    }
  >;
};

const percentual = (v: number | null | undefined) =>
  v != null ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : "—";
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

/** Corpo do detalhe de uma nota de saída — usado tanto na página cheia quanto na cortina. */
export function NotaSaidaDetalheContent({ nota }: { nota: NotaSaidaDetalhe }) {
  // Valores de comissão são restritos (o perfil Vendedor não vê) — a API já
  // devolve nulo pra quem não pode, e aqui a coluna some junto.
  const podeVerComissao = useAuthStore((s) => s.hasPermission)("comissao", "visualizar");
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                  {podeVerComissao && (
                    <TableHead className="text-right">% Comissão</TableHead>
                  )}
                  <TableHead>Regra de desconto</TableHead>
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
                    {podeVerComissao && (
                      <TableCell className="text-right">{percentual(it.percComissao)}</TableCell>
                    )}
                    <TableCell className="text-xs">{regraDescontoLabel(it.regraDesconto)}</TableCell>
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
 * Cortina lateral com o detalhe da nota — usada dentro da Posição de Cliente
 * pra não perder a busca/scroll/aba de quem está consultando a posição.
 */
export function NotaSaidaSheet({
  id,
  onOpenChange,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: nota, isLoading, isError } = useQuery({
    queryKey: ["notas-saida", id],
    queryFn: () => apiFetch<NotaSaidaDetalhe>(`/notas-saida/${id}`),
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
                {nota.comodato && <Badge variant="outline">Comodato</Badge>}
                {!nota.ativo && <Badge variant="destructive">Inativa</Badge>}
              </>
            ) : (
              "Nota fiscal de saída"
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
          {isError && <p className="text-sm text-muted-foreground">Nota de saída não encontrada.</p>}
          {nota && <NotaSaidaDetalheContent nota={nota} />}
        </div>
      </ResizableSheetContent>
    </Sheet>
  );
}
