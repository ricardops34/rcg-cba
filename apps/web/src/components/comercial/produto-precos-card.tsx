"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { regraDescontoLabel } from "@/lib/regra-desconto";
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

type OrigemRegra = "tabela" | "produto" | "categoria" | "padrao";

type PrecoTabela = {
  id: string;
  preco: number;
  tabela: { id: string; codigoErp: string; descricao: string };
  regraDesconto: {
    id: string;
    codigoErp: string | null;
    descricao: string;
    percDescontoMaximo: number;
  } | null;
  regraDescontoOrigem: OrigemRegra | null;
};

// A regra do item da tabela é a normal; as demais são herdadas e vale avisar.
const ORIGEM_HERDADA: Record<Exclude<OrigemRegra, "tabela">, string> = {
  produto: "do produto",
  categoria: "da categoria",
  padrao: "regra padrão",
};

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const percentual = (v: number) =>
  `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/**
 * Preço de venda e regra de desconto do produto em cada tabela de preço ativa
 * (aba Preços do detalhe). A regra mora no item da tabela (DA1_XDESC), por
 * isso aparece aqui e não nos dados gerais.
 */
export function ProdutoPrecosCard({ produtoId }: { produtoId: string }) {
  const { data: resposta, isLoading } = useQuery({
    queryKey: ["produtos", produtoId, "precos"],
    queryFn: () => apiFetch<{ data: PrecoTabela[] }>(`/produtos/${produtoId}/precos`),
  });

  const precos = resposta?.data ?? [];

  return (
    <Card>
      <CardContent>
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
                  <TableHead>Regra de desconto</TableHead>
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
                    <TableCell className="whitespace-normal">
                      <p>{regraDescontoLabel(p.regraDesconto)}</p>
                      {p.regraDesconto && (
                        <p className="text-xs text-muted-foreground">
                          Desc. máx. {percentual(p.regraDesconto.percDescontoMaximo)}
                          {p.regraDescontoOrigem && p.regraDescontoOrigem !== "tabela"
                            ? ` · ${ORIGEM_HERDADA[p.regraDescontoOrigem]}`
                            : null}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {moeda(p.preco)}
                    </TableCell>
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
