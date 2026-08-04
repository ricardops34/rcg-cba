"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Atividade } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { AtividadeForm } from "@/components/crud/atividade-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditarAtividadePage() {
  const { id } = useParams<{ id: string }>();

  const { data: atividade, isLoading, isError } = useQuery({
    queryKey: ["atividades", id],
    queryFn: () => apiFetch<Atividade>(`/atividades/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !atividade) {
    return <p className="text-sm text-muted-foreground">Atividade não encontrada.</p>;
  }

  return <AtividadeForm atividade={atividade} />;
}
