"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Produto } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { ProdutoForm } from "@/components/crud/produto-form";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/stores/auth-store";

export default function EditarProdutoPage() {
  const { id } = useParams<{ id: string }>();
  const podeEditarExtras = useAuthStore(
    (state) =>
      state.hasPermission("produtos-cadastro", "editar") ||
      state.hasPermission("produtos", "editar"),
  );

  const {
    data: produto,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["produtos", id],
    queryFn: () => apiFetch<Produto>(`/produtos/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !produto) {
    return <p className="text-sm text-muted-foreground">Produto não encontrado.</p>;
  }

  return <ProdutoForm produto={produto} permitirEdicaoExtras={podeEditarExtras} />;
}
