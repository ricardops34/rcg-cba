"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PrecoTabela = {
  id: string;
  preco: number;
  tabela: { id: string; codigoErp: string; descricao: string };
};

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Preço de venda do produto em cada tabela de preço ativa (aba Preços do detalhe). */
export function ProdutoPrecosCard({ produtoId }: { produtoId: string }) {
  const { data: resposta, isLoading } = useQuery({
    queryKey: ["produtos", produtoId, "precos"],
    queryFn: () => apiFetch<{ data: PrecoTabela[] }>(`/produtos/${produtoId}/precos`),
  });

  const precos = resposta?.data ?? [];

  return (
    <Card>
      <CardContent>
        <p className="mb-3 text-sm font-medium">Preço nas tabelas ativas ({precos.length})</p>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : precos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este produto não está em nenhuma tabela de preço ativa.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tabela de preço</TableHead>
                  <TableHead className="text-right">Preço de venda</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {precos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <p>{p.tabela.descricao}</p>
                      <p className="font-mono text-xs text-muted-foreground">{p.tabela.codigoErp}</p>
                    </TableCell>
                    <TableCell className="text-right font-medium">{moeda(p.preco)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
