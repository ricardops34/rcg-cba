"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Feriado } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { FeriadoForm } from "@/components/crud/feriado-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarFeriadoPage() {
  const { id } = useParams<{ id: string }>();

  const { data: feriado, isLoading, isError } = useQuery({
    queryKey: ["feriados", id],
    queryFn: () => apiFetch<Feriado>(`/feriados/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !feriado) {
    return <p className="text-sm text-muted-foreground">Feriado não encontrado.</p>;
  }

  return <FeriadoForm feriado={feriado} />;
}
