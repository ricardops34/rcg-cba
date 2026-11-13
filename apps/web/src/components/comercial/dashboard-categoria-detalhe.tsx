"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ObjetivoDashboardCategoriaDetalhe } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResizableSheetContent } from "@/components/ui/resizable-sheet-content";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, Search } from "lucide-react";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const quantidade = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const percentual = (v: number, total: number) =>
  total > 0 ? `${((v * 100) / total).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";

/** Chave do cliente no cruzamento: o item sem cliente vem com id nulo. */
const SEM_CLIENTE = "sem-cliente";
const chaveCliente = (id: string | null) => id ?? SEM_CLIENTE;

export interface FiltrosDetalheCategoria {
  mes: number;
  ano: number;
  vendedorId?: string;
  municipio?: string;
}

interface Props {
  /** Categoria clicada; nulo = cortina fechada. */
  categoria: { categoriaId: string; codigoErp: string; descricao: string } | null;
  filtros: FiltrosDetalheCategoria;
  /** Rótulo do recorte (período, município, vendedor), para a cortina dizer de onde vem o número. */
  recorte: string;
  /** Falso esconde os valores em R$ (opção do Dashboard Gerencial): ficam quantidade e %. */
  mostrarValores?: boolean;
  onClose: () => void;
}

/**
 * Cortina do Dashboard Comercial que abre ao clicar numa linha de "Vendas
 * Categoria": o realizado da categoria aberto por produto e por cliente.
 *
 * Em cada aba, a linha abre o outro lado do cruzamento — o produto mostra
 * quem comprou, o cliente mostra o que comprou. O cruzamento vem inteiro na
 * mesma resposta: é um mês de uma categoria, e buscar por clique custaria uma
 * ida à API para dado que já foi somado.
 */
export function DashboardCategoriaDetalhe({
  categoria,
  filtros,
  recorte,
  mostrarValores = true,
  onClose,
}: Props) {
  const [aba, setAba] = useState<"produtos" | "clientes">("produtos");
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const categoriaId = categoria?.categoriaId;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["objetivos", "dashboard", "categoria", categoriaId, filtros],
    enabled: !!categoriaId,
    queryFn: () =>
      apiFetch<ObjetivoDashboardCategoriaDetalhe>(`/objetivos/dashboard/categorias/${categoriaId}`, {
        query: {
          mes: filtros.mes,
          ano: filtros.ano,
          ...(filtros.vendedorId ? { vendedorId: filtros.vendedorId } : {}),
          ...(filtros.municipio ? { municipio: filtros.municipio } : {}),
        },
      }),
  });

  const nomes = useMemo(() => {
    const produtos = new Map((data?.produtos ?? []).map((p) => [p.id, p]));
    const clientes = new Map((data?.clientes ?? []).map((c) => [chaveCliente(c.id), c]));
    return { produtos, clientes };
  }, [data]);

  const termo = busca.trim().toLowerCase();
  const casa = (...textos: (string | null | undefined)[]) =>
    !termo || textos.some((t) => (t ?? "").toLowerCase().includes(termo));

  const produtos = (data?.produtos ?? []).filter((p) => casa(p.descricao, p.codigo));
  const clientes = (data?.clientes ?? []).filter((c) => casa(c.nome, c.codigo, c.municipio));

  const trocarAba = (valor: string) => {
    setAba(valor as "produtos" | "clientes");
    setAbertos(new Set());
  };

  const alternar = (chave: string) =>
    setAbertos((atual) => {
      const proximo = new Set(atual);
      if (!proximo.delete(chave)) proximo.add(chave);
      return proximo;
    });

  const fechar = (aberta: boolean) => {
    if (aberta) return;
    setBusca("");
    setAbertos(new Set());
    setAba("produtos");
    onClose();
  };

  const total = data?.realizado ?? 0;

  return (
    <Sheet open={!!categoria} onOpenChange={fechar}>
      <ResizableSheetContent defaultWidth={760}>
        <SheetHeader>
          <SheetTitle>
            {categoria ? `${categoria.codigoErp} · ${categoria.descricao}` : ""}
          </SheetTitle>
          <SheetDescription>
            {recorte}
            {data && mostrarValores ? ` — ${moeda(total)} realizados` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
          {isLoading ? (
            <Skeleton className="h-80 w-full rounded-lg" />
          ) : isError || !data ? (
            <p className="text-sm text-muted-foreground">Não foi possível carregar o detalhe.</p>
          ) : data.produtos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma venda desta categoria no período.</p>
          ) : (
            <Tabs value={aba} onValueChange={trocarAba} className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <TabsList>
                  <TabsTrigger value="produtos">Produtos ({data.produtos.length})</TabsTrigger>
                  <TabsTrigger value="clientes">Clientes ({data.clientes.length})</TabsTrigger>
                </TabsList>
                <div className="relative ml-auto w-full sm:max-w-60">
                  <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={aba === "produtos" ? "Buscar produto..." : "Buscar cliente..."}
                    className="pl-8"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {aba === "produtos"
                  ? "Clique no produto para ver os clientes que compraram."
                  : "Clique no cliente para ver os produtos que ele comprou."}
              </p>

              <TabsContent value="produtos" className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Qtd.</TableHead>
                      {mostrarValores && <TableHead className="text-right">Realizado</TableHead>}
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {produtos.map((p) => {
                      const aberto = abertos.has(p.id);
                      const compradores = aberto
                        ? data.itens
                            .filter((i) => i.produtoId === p.id)
                            .sort((a, b) => b.realizado - a.realizado)
                        : [];
                      return (
                        <Fragment key={p.id}>
                          <TableRow
                            className="cursor-pointer"
                            onClick={() => alternar(p.id)}
                            aria-expanded={aberto}
                          >
                            <TableCell className="whitespace-normal">
                              <div className="flex items-start gap-1">
                                {aberto ? (
                                  <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                )}
                                <div className="min-w-0">
                                  <p className="text-xs break-words">{p.descricao}</p>
                                  <p className="font-mono text-[11px] text-muted-foreground">{p.codigo}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {quantidade(p.quantidade)} {p.unidade ?? ""}
                            </TableCell>
                            {mostrarValores && (
                              <TableCell className="text-right text-xs font-medium tabular-nums">
                                {moeda(p.realizado)}
                              </TableCell>
                            )}
                            <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                              {percentual(p.realizado, total)}
                            </TableCell>
                          </TableRow>
                          {compradores.map((i) => {
                            const c = nomes.clientes.get(chaveCliente(i.clienteId));
                            return (
                              <TableRow key={`${p.id}/${chaveCliente(i.clienteId)}`} className="bg-muted/20">
                                <TableCell className="pl-9 whitespace-normal">
                                  <p className="text-xs break-words">{c?.nome ?? "—"}</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {[c?.codigo, c?.municipio].filter(Boolean).join(" · ")}
                                  </p>
                                </TableCell>
                                <TableCell className="text-right text-xs tabular-nums">
                                  {quantidade(i.quantidade)} {p.unidade ?? ""}
                                </TableCell>
                                {mostrarValores && (
                                  <TableCell className="text-right text-xs tabular-nums">{moeda(i.realizado)}</TableCell>
                                )}
                                <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                                  {percentual(i.realizado, p.realizado)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                  <TableFooter className="sticky bottom-0 bg-card">
                    <TableRow>
                      <TableCell colSpan={2}>Total da categoria</TableCell>
                      {mostrarValores && <TableCell className="text-right tabular-nums">{moeda(total)}</TableCell>}
                      <TableCell className="text-right tabular-nums">100%</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </TabsContent>

              <TabsContent value="clientes" className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      {mostrarValores && <TableHead className="text-right">Realizado</TableHead>}
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientes.map((c) => {
                      const chave = chaveCliente(c.id);
                      const aberto = abertos.has(chave);
                      const comprados = aberto
                        ? data.itens
                            .filter((i) => chaveCliente(i.clienteId) === chave)
                            .sort((a, b) => b.realizado - a.realizado)
                        : [];
                      return (
                        <Fragment key={chave}>
                          <TableRow
                            className="cursor-pointer"
                            onClick={() => alternar(chave)}
                            aria-expanded={aberto}
                          >
                            <TableCell className="whitespace-normal">
                              <div className="flex items-start gap-1">
                                {aberto ? (
                                  <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                )}
                                <div className="min-w-0">
                                  <p className="text-xs break-words">{c.nome}</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {[c.codigo, c.municipio].filter(Boolean).join(" · ")}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            {mostrarValores && (
                              <TableCell className="text-right text-xs font-medium tabular-nums">
                                {moeda(c.realizado)}
                              </TableCell>
                            )}
                            <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                              {percentual(c.realizado, total)}
                            </TableCell>
                          </TableRow>
                          {comprados.map((i) => {
                            const p = nomes.produtos.get(i.produtoId);
                            return (
                              <TableRow key={`${chave}/${i.produtoId}`} className="bg-muted/20">
                                <TableCell className="pl-9 whitespace-normal">
                                  <p className="text-xs break-words">{p?.descricao ?? "—"}</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    <span className="font-mono">{p?.codigo}</span> · {quantidade(i.quantidade)}{" "}
                                    {p?.unidade ?? ""}
                                  </p>
                                </TableCell>
                                {mostrarValores && (
                                  <TableCell className="text-right text-xs tabular-nums">{moeda(i.realizado)}</TableCell>
                                )}
                                <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                                  {percentual(i.realizado, c.realizado)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                  <TableFooter className="sticky bottom-0 bg-card">
                    <TableRow>
                      <TableCell>Total da categoria</TableCell>
                      {mostrarValores && <TableCell className="text-right tabular-nums">{moeda(total)}</TableCell>}
                      <TableCell className="text-right tabular-nums">100%</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </ResizableSheetContent>
    </Sheet>
  );
}
