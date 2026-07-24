"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Categoria } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { CategoriaForm } from "@/components/crud/categoria-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarCategoriaPage() {
  const { id } = useParams<{ id: string }>();

  const { data: categoria, isLoading, isError } = useQuery({
    queryKey: ["categorias", id],
    queryFn: () => apiFetch<Categoria>(`/categorias/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !categoria) {
    return <p className="text-sm text-muted-foreground">Categoria não encontrada.</p>;
  }

  return <CategoriaForm categoria={categoria} />;
}
