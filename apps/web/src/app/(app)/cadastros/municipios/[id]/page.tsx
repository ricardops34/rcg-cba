"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Municipio } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { MunicipioForm } from "@/components/crud/municipio-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarMunicipioPage() {
  const { id } = useParams<{ id: string }>();

  const { data: municipio, isLoading, isError } = useQuery({
    queryKey: ["municipios", id],
    queryFn: () => apiFetch<Municipio>(`/municipios/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !municipio) {
    return <p className="text-sm text-muted-foreground">Município não encontrado.</p>;
  }

  return <MunicipioForm municipio={municipio} />;
}
