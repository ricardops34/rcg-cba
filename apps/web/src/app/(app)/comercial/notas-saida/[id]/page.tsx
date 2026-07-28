"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { NotaSaidaDetalheContent, type NotaSaidaDetalhe } from "@/components/comercial/nota-saida-detalhe";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/comercial/notas-saida";

// Detalhe read-only: os dados entram pelo import do ERP.
export default function NotaSaidaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: nota, isLoading, isError } = useQuery({
    queryKey: ["notas-saida", id],
    queryFn: () => apiFetch<NotaSaidaDetalhe>(`/notas-saida/${id}`),
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
    return <p className="text-sm text-muted-foreground">Nota de saída não encontrada.</p>;
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
        {nota.comodato && <Badge variant="outline">Comodato</Badge>}
        {!nota.ativo && <Badge variant="destructive">Inativa</Badge>}
      </div>

      <NotaSaidaDetalheContent nota={nota} />
    </div>
  );
}
