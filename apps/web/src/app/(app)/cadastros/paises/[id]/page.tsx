"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Pais } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { PaisForm } from "@/components/crud/pais-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarPaisPage() {
  const { id } = useParams<{ id: string }>();

  const { data: pais, isLoading, isError } = useQuery({
    queryKey: ["paises", id],
    queryFn: () => apiFetch<Pais>(`/paises/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !pais) {
    return <p className="text-sm text-muted-foreground">País não encontrado.</p>;
  }

  return <PaisForm pais={pais} />;
}
