"use client";

import { useQuery } from "@tanstack/react-query";
import type { Produto } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import { StatusDot } from "@/components/crud/status-dot";

export type ProdutoDetalhe = Produto & {
  categoria?: { id: string; codigoErp: string | null; descricao: string } | null;
  subCategoria?: { id: string; codigoErp: string | null; descricao: string } | null;
  armazem?: { id: string; codigoErp: string | null; descricao: string } | null;
};

const moeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}

/** Corpo do detalhe de um produto — usado tanto na página cheia quanto na cortina. */
export function ProdutoDetalheContent({ produto }: { produto: ProdutoDetalhe }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Info label="Código ERP" value={produto.codigoErp} />
        <Info label="Unidade" value={produto.unidade || "—"} />
        <Info label="Marca" value={produto.marca || "—"} />
        <Info label="Código de barras" value={produto.codigoBarras || "—"} />
        <Info label="Categoria" value={produto.categoria?.descricao ?? "—"} />
        <Info label="Subcategoria" value={produto.subCategoria?.descricao ?? "—"} />
        <Info label="Armazém" value={produto.armazem?.descricao ?? "—"} />
        <Info label="NCM" value={produto.ncm || "—"} />
        <Info label="Qtd. embalagem" value={produto.qtdEmbalagem ?? "—"} />
        <Info label="Peso" value={produto.peso ?? "—"} />
        <Info label="Último preço" value={moeda(produto.ultimoPreco)} />
        {produto.observacao && (
          <div className="col-span-2 sm:col-span-4">
            <p className="text-xs text-muted-foreground">Observação</p>
            <p className="text-sm">{produto.observacao}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Cortina lateral com o detalhe do produto — usada dentro da Posição de
 * Cliente (aba Mix) pra não perder a busca/scroll/aba de quem está
 * consultando a posição.
 */
export function ProdutoSheet({
  id,
  onOpenChange,
}: {
  id: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: produto, isLoading, isError } = useQuery({
    queryKey: ["produtos", id],
    queryFn: () => apiFetch<ProdutoDetalhe>(`/produtos/${id}`),
    enabled: !!id,
  });

  return (
    <Sheet open={!!id} onOpenChange={onOpenChange}>
      <ResizableSheetContent defaultWidth={520}>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {produto ? (
              <>
                {produto.descricao}
                <StatusDot active={produto.ativo} />
                {!produto.ativo && <Badge variant="destructive">Inativo</Badge>}
              </>
            ) : (
              "Produto"
            )}
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          {isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
          {isError && <p className="text-sm text-muted-foreground">Produto não encontrado.</p>}
          {produto && <ProdutoDetalheContent produto={produto} />}
        </div>
      </ResizableSheetContent>
    </Sheet>
  );
}
