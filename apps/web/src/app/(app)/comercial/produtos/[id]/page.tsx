"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/crud/status-dot";
import {
  ProdutoDetalheContent,
  type ProdutoDetalhe,
} from "@/components/comercial/produto-detalhe";
import { ArrowLeft } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";

const LIST_ROUTE = "/comercial/produtos";

// Detalhe read-only: os dados entram pelo import do ERP.
export default function ProdutoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const podeEditarFoto = useAuthStore((state) =>
    state.hasPermission("produtos", "editar"),
  );

  const {
    data: produto,
    isLoading,
    isError,
  } = useQuery({
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
    return (
      <p className="text-sm text-muted-foreground">Produto não encontrado.</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(LIST_ROUTE)}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {produto.descricao}
        </h1>
        <StatusDot active={produto.ativo} />
        {!produto.ativo && <Badge variant="destructive">Inativo</Badge>}
      </div>

      <ProdutoDetalheContent
        produto={produto}
        permitirEdicaoFoto={podeEditarFoto}
      />
    </div>
  );
}
