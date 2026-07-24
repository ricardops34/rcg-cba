"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Estado } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { EstadoForm } from "@/components/crud/estado-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarEstadoPage() {
  const { id } = useParams<{ id: string }>();

  const { data: estado, isLoading, isError } = useQuery({
    queryKey: ["estados", id],
    queryFn: () => apiFetch<Estado>(`/estados/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !estado) {
    return <p className="text-sm text-muted-foreground">Estado não encontrado.</p>;
  }

  return <EstadoForm estado={estado} />;
}
