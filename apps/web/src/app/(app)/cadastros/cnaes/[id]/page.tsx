"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Cnae } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { CnaeForm } from "@/components/crud/cnae-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarCnaePage() {
  const { id } = useParams<{ id: string }>();

  const { data: cnae, isLoading, isError } = useQuery({
    queryKey: ["cnaes", id],
    queryFn: () => apiFetch<Cnae>(`/cnaes/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !cnae) {
    return <p className="text-sm text-muted-foreground">CNAE não encontrado.</p>;
  }

  return <CnaeForm cnae={cnae} />;
}
