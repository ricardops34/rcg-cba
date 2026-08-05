"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TituloReceberDetalheContent,
  type TituloReceberDetalhe,
} from "@/components/comercial/titulo-receber-detalhe";
import { TituloStatusBadge } from "@/components/comercial/titulo-status-badge";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/comercial/titulos-receber";

// Detalhe read-only: os dados entram pelo import do ERP.
export default function TituloReceberDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: titulo, isLoading, isError } = useQuery({
    queryKey: ["titulos-receber", id],
    queryFn: () => apiFetch<TituloReceberDetalhe>(`/titulos-receber/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !titulo) {
    return <p className="text-sm text-muted-foreground">Título não encontrado.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {titulo.prefixo && `${titulo.prefixo}-`}
          {titulo.numero}
          {titulo.parcela && `/${titulo.parcela}`}
        </h1>
        <TituloStatusBadge status={titulo.status} />
      </div>

      <TituloReceberDetalheContent titulo={titulo} />
    </div>
  );
}
