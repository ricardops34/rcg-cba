"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  NotaEntradaDetalheContent,
  type NotaEntradaDetalhe,
} from "@/components/compras/nota-entrada-detalhe";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/cadastros/notas-entrada";

// Detalhe read-only: os dados entram pela API de integração do ERP.
export default function NotaEntradaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: nota, isLoading, isError } = useQuery({
    queryKey: ["notas-entrada", id],
    queryFn: () => apiFetch<NotaEntradaDetalhe>(`/notas-entrada/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !nota) {
    return <p className="text-sm text-muted-foreground">Nota de entrada não encontrada.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          Nota {nota.numero}
          {nota.serie ? `/${nota.serie}` : ""}
        </h1>
        {!nota.ativo && <Badge variant="destructive">Inativa</Badge>}
      </div>

      <NotaEntradaDetalheContent nota={nota} />
    </div>
  );
}
