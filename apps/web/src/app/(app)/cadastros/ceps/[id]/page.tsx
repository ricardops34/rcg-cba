"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Cep } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { CepForm } from "@/components/crud/cep-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarCepPage() {
  const { id } = useParams<{ id: string }>();

  const { data: cep, isLoading, isError } = useQuery({
    queryKey: ["ceps", id],
    queryFn: () => apiFetch<Cep>(`/ceps/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !cep) {
    return <p className="text-sm text-muted-foreground">CEP não encontrado.</p>;
  }

  return <CepForm cep={cep} />;
}
