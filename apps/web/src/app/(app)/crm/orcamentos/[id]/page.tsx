"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Orcamento } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { OrcamentoForm } from "@/components/crud/orcamento-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarOrcamentoPage() {
  const { id } = useParams<{ id: string }>();

  const { data: orcamento, isLoading, isError } = useQuery({
    queryKey: ["orcamentos", id],
    queryFn: () => apiFetch<Orcamento>(`/orcamentos/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !orcamento) {
    return <p className="text-sm text-muted-foreground">Orçamento não encontrado.</p>;
  }

  return <OrcamentoForm orcamento={orcamento} />;
}
