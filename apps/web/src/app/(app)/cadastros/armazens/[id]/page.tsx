"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Armazem } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { ArmazemForm } from "@/components/crud/armazem-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarArmazemPage() {
  const { id } = useParams<{ id: string }>();

  const { data: armazem, isLoading, isError } = useQuery({
    queryKey: ["armazens", id],
    queryFn: () => apiFetch<Armazem>(`/armazens/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !armazem) {
    return <p className="text-sm text-muted-foreground">Armazém não encontrado.</p>;
  }

  return <ArmazemForm armazem={armazem} />;
}
