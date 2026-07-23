"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Usuario } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { UsuarioForm } from "@/components/crud/usuario-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarUsuarioPage() {
  const { id } = useParams<{ id: string }>();

  const { data: usuario, isLoading, isError } = useQuery({
    queryKey: ["usuarios", id],
    queryFn: () => apiFetch<Usuario>(`/usuarios/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !usuario) {
    return <p className="text-sm text-muted-foreground">Usuário não encontrado.</p>;
  }

  return <UsuarioForm usuario={usuario} />;
}
