"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Cliente } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { ClienteForm } from "@/components/crud/cliente-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarClientePage() {
  const { id } = useParams<{ id: string }>();

  const { data: cliente, isLoading, isError } = useQuery({
    queryKey: ["clientes", id],
    queryFn: () => apiFetch<Cliente>(`/clientes/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !cliente) {
    return <p className="text-sm text-muted-foreground">Cliente não encontrado.</p>;
  }

  return <ClienteForm cliente={cliente} />;
}
