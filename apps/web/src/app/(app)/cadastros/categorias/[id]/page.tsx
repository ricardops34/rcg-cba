"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CategoriaDetalheContent,
  type CategoriaDetalhe,
} from "@/components/crud/categoria-detalhe";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/cadastros/categorias";

// Detalhe somente leitura: categorias entram pelo import (e no futuro pela
// API externa de manutenção), não por esta tela.
export default function CategoriaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: categoria, isLoading, isError } = useQuery({
    queryKey: ["categorias", id],
    queryFn: () => apiFetch<CategoriaDetalhe>(`/categorias/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !categoria) {
    return <p className="text-sm text-muted-foreground">Categoria não encontrada.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{categoria.descricao}</h1>
      </div>

      <CategoriaDetalheContent categoria={categoria} />
    </div>
  );
}
