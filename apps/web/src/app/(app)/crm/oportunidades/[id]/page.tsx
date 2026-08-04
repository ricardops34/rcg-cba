"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Oportunidade } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { OportunidadeForm } from "@/components/crud/oportunidade-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarOportunidadePage() {
  const { id } = useParams<{ id: string }>();

  const { data: oportunidade, isLoading, isError } = useQuery({
    queryKey: ["oportunidades", id],
    queryFn: () => apiFetch<Oportunidade>(`/oportunidades/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !oportunidade) {
    return <p className="text-sm text-muted-foreground">Oportunidade não encontrada.</p>;
  }

  return <OportunidadeForm oportunidade={oportunidade} />;
}
