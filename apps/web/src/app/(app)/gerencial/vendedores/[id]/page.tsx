"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Vendedor } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { VendedorForm } from "@/components/crud/vendedor-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarVendedorPage() {
  const { id } = useParams<{ id: string }>();

  const { data: vendedor, isLoading, isError } = useQuery({
    queryKey: ["vendedores", id],
    queryFn: () => apiFetch<Vendedor>(`/vendedores/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !vendedor) {
    return <p className="text-sm text-muted-foreground">Vendedor não encontrado.</p>;
  }

  return <VendedorForm vendedor={vendedor} />;
}
