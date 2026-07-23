"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Perfil } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { PerfilForm } from "@/components/crud/perfil-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarPerfilPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "permissoes" ? "permissoes" : "dados";

  const { data: perfil, isLoading, isError } = useQuery({
    queryKey: ["perfis", id],
    queryFn: () => apiFetch<Perfil>(`/perfis/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !perfil) {
    return <p className="text-sm text-muted-foreground">Perfil não encontrado.</p>;
  }

  return <PerfilForm perfil={perfil} initialTab={initialTab} />;
}
