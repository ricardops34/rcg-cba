"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ObjetivoVendedorMes } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { ObjetivoForm } from "@/components/crud/objetivo-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarObjetivoPage() {
  const { id } = useParams<{ id: string }>();

  const { data: objetivo, isLoading, isError } = useQuery({
    queryKey: ["objetivos", id],
    queryFn: () => apiFetch<ObjetivoVendedorMes>(`/objetivos/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !objetivo) {
    return <p className="text-sm text-muted-foreground">Objetivo não encontrado.</p>;
  }

  return <ObjetivoForm objetivo={objetivo} />;
}
