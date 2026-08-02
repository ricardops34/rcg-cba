"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { TabelaPreco } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabelaPrecoDetalheContent } from "@/components/crud/tabela-preco-detalhe";
import { TabelaPrecoItensTable } from "@/components/crud/tabela-preco-itens-table";
import { ArrowLeft } from "lucide-react";

const LIST_ROUTE = "/cadastros/tabelas-preco";

// Detalhe somente leitura: tabelas de preço e itens entram pelo import (e no
// futuro pela API externa de manutenção), não por esta tela.
export default function TabelaPrecoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: tabelaPreco, isLoading, isError } = useQuery({
    queryKey: ["tabelas-preco", id],
    queryFn: () => apiFetch<TabelaPreco>(`/tabelas-preco/${id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !tabelaPreco) {
    return <p className="text-sm text-muted-foreground">Tabela de preço não encontrada.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(LIST_ROUTE)}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">{tabelaPreco.descricao}</h1>
      </div>

      <TabelaPrecoDetalheContent tabelaPreco={tabelaPreco} />

      <Card>
        <CardHeader>
          <CardTitle>Itens</CardTitle>
        </CardHeader>
        <CardContent>
          <TabelaPrecoItensTable tabelaPrecoId={tabelaPreco.id} />
        </CardContent>
      </Card>
    </div>
  );
}
