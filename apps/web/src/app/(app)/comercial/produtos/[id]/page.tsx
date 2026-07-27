"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Produto } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/crud/status-dot";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/comercial/produtos";

type ProdutoDetalhe = Produto & {
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

// Detalhe read-only: os dados entram pelo import do ERP.
export default function ProdutoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: produto, isLoading, isError } = useQuery({
    queryKey: ["produtos", id],
    queryFn: () => apiFetch<ProdutoDetalhe>(`/produtos/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !produto) {
    return <p className="text-sm text-muted-foreground">Produto não encontrado.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{produto.descricao}</h1>
        <StatusDot active={produto.ativo} />
        {!produto.ativo && <Badge variant="destructive">Inativo</Badge>}
      </div>

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
    </div>
  );
}
