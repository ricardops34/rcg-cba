"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { RegraDesconto } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { RegraDescontoForm } from "@/components/crud/regra-desconto-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarRegraDescontoPage() {
  const { id } = useParams<{ id: string }>();

  const {
    data: regra,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["regras-desconto", id],
    queryFn: () => apiFetch<RegraDesconto>(`/regras-desconto/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !regra) {
    return <p className="text-sm text-muted-foreground">Regra de desconto não encontrada.</p>;
  }

  return <RegraDescontoForm regra={regra} />;
}
