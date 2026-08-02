"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Armazem } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArmazemDetalheContent } from "@/components/crud/armazem-detalhe";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/cadastros/armazens";

// Detalhe somente leitura: armazéns entram pelo import (e no futuro pela API
// externa de manutenção), não por esta tela.
export default function ArmazemDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: armazem, isLoading, isError } = useQuery({
    queryKey: ["armazens", id],
    queryFn: () => apiFetch<Armazem>(`/armazens/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !armazem) {
    return <p className="text-sm text-muted-foreground">Armazém não encontrado.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{armazem.descricao}</h1>
      </div>

      <ArmazemDetalheContent armazem={armazem} />
    </div>
  );
}
