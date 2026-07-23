"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Empresa } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { EmpresaForm } from "@/components/crud/empresa-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarEmpresaPage() {
  const { id } = useParams<{ id: string }>();

  const { data: empresa, isLoading, isError } = useQuery({
    queryKey: ["empresas", id],
    queryFn: () => apiFetch<Empresa>(`/empresas/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !empresa) {
    return <p className="text-sm text-muted-foreground">Empresa não encontrada.</p>;
  }

  return <EmpresaForm empresa={empresa} />;
}
