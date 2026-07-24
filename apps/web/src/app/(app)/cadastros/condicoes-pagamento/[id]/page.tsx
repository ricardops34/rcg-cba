"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { CondicaoPagamento } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { CondicaoPagamentoForm } from "@/components/crud/condicao-pagamento-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarCondicaoPagamentoPage() {
  const { id } = useParams<{ id: string }>();

  const { data: condicao, isLoading, isError } = useQuery({
    queryKey: ["condicoes-pagamento", id],
    queryFn: () => apiFetch<CondicaoPagamento>(`/condicoes-pagamento/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !condicao) {
    return <p className="text-sm text-muted-foreground">Condição de pagamento não encontrada.</p>;
  }

  return <CondicaoPagamentoForm condicao={condicao} />;
}
