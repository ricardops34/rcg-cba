"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ProdutoAbas,
  ProdutoTitulo,
  type ProdutoDetalhe,
} from "@/components/comercial/produto-detalhe";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/comercial/produtos";

// Detalhe read-only: os dados entram pelo import do ERP. A lista abre o mesmo
// conteúdo em cortina (ProdutoSheet); esta página fica para quem chega por link.
export default function ProdutoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

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
    <div data-tour="rotina" className="space-y-4">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(LIST_ROUTE)}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <ProdutoTitulo produto={produto} />
      </div>

      <ProdutoAbas produto={produto} completo />
    </div>
  );
}
