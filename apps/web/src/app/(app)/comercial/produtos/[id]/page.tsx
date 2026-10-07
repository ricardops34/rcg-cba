"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ProdutoDetalheContent,
  ProdutoTitulo,
  type ProdutoDetalhe,
} from "@/components/comercial/produto-detalhe";
import { ProdutoEstoqueCard } from "@/components/comercial/produto-estoque-card";
import { ProdutoCamposCard } from "@/components/comercial/produto-campos-card";
import { ProdutoRelacionadosCard } from "@/components/comercial/produto-relacionados-card";
import { ProdutoFichasCard } from "@/components/comercial/produto-fichas-card";
import { ProdutoPrecosCard } from "@/components/comercial/produto-precos-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";

const LIST_ROUTE = "/comercial/produtos";

// Detalhe read-only: os dados entram pelo import do ERP.
export default function ProdutoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // A mesma permissão vale para a foto e para os dados complementares: são as
  // duas coisas do produto que não vêm do ERP.
  const podeEditar = useAuthStore((state) =>
    state.hasPermission("produtos", "editar"),
  );
  // A aba Estoque lê a rota da Consulta de Estoque, que tem permissão própria.
  const verEstoque = useAuthStore((state) =>
    state.hasPermission("estoque", "visualizar"),
  );

  const {
    data: produto,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["produtos", id],
    queryFn: () => apiFetch<ProdutoDetalhe>(`/produtos/${id}`),
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
    return (
      <p className="text-sm text-muted-foreground">Produto não encontrado.</p>
    );
  }

  return (
    <div data-tour="rotina" className="space-y-4">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(LIST_ROUTE)}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <ProdutoTitulo produto={produto} />
      </div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados gerais</TabsTrigger>
          {verEstoque && <TabsTrigger value="estoque">Estoque</TabsTrigger>}
          <TabsTrigger value="precos">Preços</TabsTrigger>
          <TabsTrigger value="complementares">Complementares</TabsTrigger>
          <TabsTrigger value="fichas">Fichas técnicas</TabsTrigger>
          <TabsTrigger value="relacionados">Relacionados</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <ProdutoDetalheContent produto={produto} permitirEdicaoFoto={podeEditar} />
        </TabsContent>

        {verEstoque && (
          <TabsContent value="estoque">
            <ProdutoEstoqueCard produtoId={produto.id} />
          </TabsContent>
        )}

        <TabsContent value="precos">
          <ProdutoPrecosCard produtoId={produto.id} />
        </TabsContent>

        <TabsContent value="complementares">
          <ProdutoCamposCard produtoId={produto.id} permitirEdicao={podeEditar} />
        </TabsContent>

        <TabsContent value="fichas">
          <ProdutoFichasCard produtoId={produto.id} permitirEdicao={podeEditar} />
        </TabsContent>

        <TabsContent value="relacionados">
          <ProdutoRelacionadosCard produtoId={produto.id} permitirEdicao={podeEditar} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
