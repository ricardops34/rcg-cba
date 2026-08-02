"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { CondicaoPagamento } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CondicaoPagamentoDetalheContent } from "@/components/crud/condicao-pagamento-detalhe";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/cadastros/condicoes-pagamento";

// Detalhe somente leitura: condições de pagamento entram pelo import (e no
// futuro pela API externa de manutenção), não por esta tela.
export default function CondicaoPagamentoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: condicao, isLoading, isError } = useQuery({
    queryKey: ["condicoes-pagamento", id],
    queryFn: () => apiFetch<CondicaoPagamento>(`/condicoes-pagamento/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !condicao) {
    return <p className="text-sm text-muted-foreground">Condição de pagamento não encontrada.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{condicao.descricao}</h1>
      </div>

      <CondicaoPagamentoDetalheContent condicao={condicao} />
    </div>
  );
}
