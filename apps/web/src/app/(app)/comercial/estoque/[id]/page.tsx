"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { EstoqueDetalhe } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EstoqueBloqueadoBadge,
  EstoqueDetalheConteudo,
} from "@/components/comercial/estoque-detalhe";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/comercial/estoque";

// Detalhe read-only: abre o saldo do produto por armazém. A lista abre o mesmo
// conteúdo em cortina (EstoqueSheet); esta página fica para quem chega por link.
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

  return (
    <div data-tour="rotina" className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{detalhe.produto.descricao}</h1>
          {!detalhe.produto.ativo && <EstoqueBloqueadoBadge />}
        </div>
      </div>

      <EstoqueDetalheConteudo detalhe={detalhe} />
    </div>
  );
}
