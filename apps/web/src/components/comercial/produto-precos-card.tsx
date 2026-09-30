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
  tabela: {
    id: string;
    codigoErp: string;
    descricao: string;
    dtInicio: string | null;
    dtFim: string | null;
  };
};

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Vigência é data sem hora (@db.Date): lida em UTC para não voltar um dia.
const data = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null;

function vigencia(t: PrecoTabela["tabela"]) {
  const inicio = data(t.dtInicio);
  const fim = data(t.dtFim);
  if (inicio && fim) return `${inicio} a ${fim}`;
  if (inicio) return `desde ${inicio}`;
  if (fim) return `até ${fim}`;
  return "sem prazo";
}

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
                  <TableHead>Vigência</TableHead>
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
                    <TableCell className="text-sm text-muted-foreground">{vigencia(p.tabela)}</TableCell>
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
