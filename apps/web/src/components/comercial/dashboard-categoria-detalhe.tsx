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

/** Chaves no cruzamento: item sem cliente (ou sem produto) vem com id nulo. */
const chaveCliente = (id: string | null) => id ?? "sem-cliente";
const chaveProduto = (id: string | null) => id ?? "sem-produto";

export type AbaComposicao = "produtos" | "clientes";
export type Composicao = ObjetivoDashboardCategoriaDetalhe;

export interface FiltrosDetalheCategoria {
  mes: number;
  ano: number;
  vendedorId?: string;
  municipio?: string;
}

/**
 * O realizado aberto por produto e cliente. Com categoria, só a dela; sem,
 * o total inteiro do recorte. O cruzamento vem numa resposta só: é um mês,
 * e buscar por clique custaria uma ida à API para dado que já foi somado.
 */
export function useComposicao(
  categoriaId: string | null,
  filtros: FiltrosDetalheCategoria,
  habilitado: boolean,
) {
  return useQuery({
    queryKey: ["objetivos", "dashboard", "composicao", categoriaId, filtros],
    enabled: habilitado,
    queryFn: () =>
      apiFetch<Composicao>(
        categoriaId
          ? `/objetivos/dashboard/categorias/${categoriaId}`
          : "/objetivos/dashboard/composicao",
        {
          query: {
            mes: filtros.mes,
            ano: filtros.ano,
            ...(filtros.vendedorId ? { vendedorId: filtros.vendedorId } : {}),
            ...(filtros.municipio ? { municipio: filtros.municipio } : {}),
          },
        },
      ),
  });
}

function Seta({ aberta }: { aberta: boolean }) {
  return aberta ? (
    <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
  ) : (
    <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
  );
}

/**
 * Uma das duas visões do cruzamento, com busca. A linha abre o outro lado:
 * o produto mostra quem comprou, o cliente mostra o que comprou.
 */
export function ComposicaoTabela({
  data,
  aba,
  mostrarValores = true,
  rotuloTotal = "Total",
}: {
  data: Composicao;
  aba: AbaComposicao;
  mostrarValores?: boolean;
  rotuloTotal?: string;
}) {
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const nomes = useMemo(
    () => ({
      produtos: new Map(data.produtos.map((p) => [chaveProduto(p.id), p])),
      clientes: new Map(data.clientes.map((c) => [chaveCliente(c.id), c])),
    }),
    [data],
  );

  const termo = busca.trim().toLowerCase();
  const casa = (...textos: (string | null | undefined)[]) =>
    !termo || textos.some((t) => (t ?? "").toLowerCase().includes(termo));

  const alternar = (chave: string) =>
    setAbertos((atual) => {
      const proximo = new Set(atual);
      if (!proximo.delete(chave)) proximo.add(chave);
      return proximo;
    });

  const total = data.realizado;
  const ehProdutos = aba === "produtos";

  // Linhas no formato comum às duas visões: a principal e, aberta, as do
  // outro lado do cruzamento.
  const linhas = ehProdutos
    ? data.produtos
        .filter((p) => casa(p.descricao, p.codigo))
        .map((p) => ({
          chave: chaveProduto(p.id),
          titulo: p.descricao,
          sub: p.codigo ?? "",
          mono: true,
          qtd: `${quantidade(p.quantidade)} ${p.unidade ?? ""}`,
          realizado: p.realizado,
        }))
    : data.clientes
        .filter((c) => casa(c.nome, c.codigo, c.municipio))
        .map((c) => ({
          chave: chaveCliente(c.id),
          titulo: c.nome,
          sub: [c.codigo, c.municipio].filter(Boolean).join(" · "),
          mono: false,
          qtd: null as string | null,
          realizado: c.realizado,
        }));

  const filhos = (chave: string) =>
    data.itens
      .filter((i) =>
        ehProdutos ? chaveProduto(i.produtoId) === chave : chaveCliente(i.clienteId) === chave,
      )
      .sort((a, b) => b.realizado - a.realizado)
      .map((i) => {
        if (ehProdutos) {
          const c = nomes.clientes.get(chaveCliente(i.clienteId));
          const unidade = nomes.produtos.get(chave)?.unidade ?? "";
          return {
            chave: chaveCliente(i.clienteId),
            titulo: c?.nome ?? "—",
            sub: [c?.codigo, c?.municipio].filter(Boolean).join(" · "),
            qtd: `${quantidade(i.quantidade)} ${unidade}`,
            realizado: i.realizado,
          };
        }
        const p = nomes.produtos.get(chaveProduto(i.produtoId));
        return {
          chave: chaveProduto(i.produtoId),
          titulo: p?.descricao ?? "—",
          sub: [p?.codigo, `${quantidade(i.quantidade)} ${p?.unidade ?? ""}`.trim()]
            .filter(Boolean)
            .join(" · "),
          qtd: null as string | null,
          realizado: i.realizado,
        };
      });

  const colunas = 2 + (ehProdutos ? 1 : 0) + (mostrarValores ? 1 : 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          {ehProdutos
            ? "Clique no produto para ver os clientes que compraram."
            : "Clique no cliente para ver os produtos que ele comprou."}
        </p>
        <div className="relative ml-auto w-full sm:max-w-60">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={ehProdutos ? "Buscar produto..." : "Buscar cliente..."}
            className="pl-8"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>{ehProdutos ? "Produto" : "Cliente"}</TableHead>
              {ehProdutos && <TableHead className="text-right">Qtd.</TableHead>}
              {mostrarValores && <TableHead className="text-right">Realizado</TableHead>}
              <TableHead className="text-right">%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={colunas} className="text-center text-xs text-muted-foreground">
                  Nada encontrado.
                </TableCell>
              </TableRow>
            )}
            {linhas.map((l) => {
              const aberta = abertos.has(l.chave);
              return (
                <Fragment key={l.chave}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => alternar(l.chave)}
                    aria-expanded={aberta}
                  >
                    <TableCell className="whitespace-normal">
                      <div className="flex items-start gap-1">
                        <Seta aberta={aberta} />
                        <div className="min-w-0">
                          <p className="text-xs break-words">{l.titulo}</p>
                          {l.sub && (
                            <p
                              className={
                                l.mono
                                  ? "font-mono text-[11px] text-muted-foreground"
                                  : "text-[11px] text-muted-foreground"
                              }
                            >
                              {l.sub}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    {ehProdutos && (
                      <TableCell className="text-right text-xs tabular-nums">{l.qtd}</TableCell>
                    )}
                    {mostrarValores && (
                      <TableCell className="text-right text-xs font-medium tabular-nums">
                        {moeda(l.realizado)}
                      </TableCell>
                    )}
                    <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                      {percentual(l.realizado, total)}
                    </TableCell>
                  </TableRow>
                  {aberta &&
                    filhos(l.chave).map((f) => (
                      <TableRow key={`${l.chave}/${f.chave}`} className="bg-muted/20">
                        <TableCell className="pl-9 whitespace-normal">
                          <p className="text-xs break-words">{f.titulo}</p>
                          {f.sub && <p className="text-[11px] text-muted-foreground">{f.sub}</p>}
                        </TableCell>
                        {ehProdutos && (
                          <TableCell className="text-right text-xs tabular-nums">{f.qtd}</TableCell>
                        )}
                        {mostrarValores && (
                          <TableCell className="text-right text-xs tabular-nums">
                            {moeda(f.realizado)}
                          </TableCell>
                        )}
                        <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                          {percentual(f.realizado, l.realizado)}
                        </TableCell>
                      </TableRow>
                    ))}
                </Fragment>
              );
            })}
          </TableBody>
          <TableFooter className="sticky bottom-0 bg-card">
            <TableRow>
              <TableCell colSpan={ehProdutos ? 2 : 1}>{rotuloTotal}</TableCell>
              {mostrarValores && (
                <TableCell className="text-right tabular-nums">{moeda(total)}</TableCell>
              )}
              <TableCell className="text-right tabular-nums">100%</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}

interface Props {
  aberto: boolean;
  /** Categoria clicada; nulo = o total inteiro do recorte (todas as categorias). */
  categoria: { categoriaId: string; codigoErp: string; descricao: string } | null;
  /** Título quando não há categoria (ex.: o nome do vendedor). */
  titulo?: string;
  /** Aba com que a cortina abre. */
  abaInicial?: AbaComposicao;
  filtros: FiltrosDetalheCategoria;
  /** Rótulo do recorte (período, município, vendedor), para a cortina dizer de onde vem o número. */
  recorte: string;
  /** Falso esconde os valores em R$ (opção do Dashboard Gerencial): ficam quantidade e %. */
  mostrarValores?: boolean;
  onClose: () => void;
}

/**
 * Cortina dos dashboards que abre um realizado por produto e por cliente:
 * uma linha de "Vendas Categoria" do Comercial, uma categoria do detalhe de
 * vendedor do Gerencial, ou — sem categoria — o total do recorte.
 */
export function DashboardCategoriaDetalhe({
  aberto,
  categoria,
  titulo,
  abaInicial = "produtos",
  filtros,
  recorte,
  mostrarValores = true,
  onClose,
}: Props) {
  const [aba, setAba] = useState<AbaComposicao>(abaInicial);
  const { data, isLoading, isError } = useComposicao(
    categoria?.categoriaId ?? null,
    filtros,
    aberto,
  );

  const fechar = (aberta: boolean) => {
    if (aberta) return;
    setAba(abaInicial);
    onClose();
  };

  return (
    <Sheet open={aberto} onOpenChange={fechar}>
      <ResizableSheetContent defaultWidth={760}>
        <SheetHeader>
          <SheetTitle>
            {categoria
              ? `${categoria.codigoErp} · ${categoria.descricao}`
              : (titulo ?? "Composição do realizado")}
          </SheetTitle>
          <SheetDescription>
            {recorte}
            {data && mostrarValores ? ` — ${moeda(data.realizado)} realizados` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
          {isLoading ? (
            <Skeleton className="h-80 w-full rounded-lg" />
          ) : isError || !data ? (
            <p className="text-sm text-muted-foreground">Não foi possível carregar o detalhe.</p>
          ) : data.produtos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma venda no período.</p>
          ) : (
            <Tabs
              value={aba}
              onValueChange={(v) => setAba(v as AbaComposicao)}
              className="flex min-h-0 flex-1 flex-col gap-3"
            >
              <TabsList>
                <TabsTrigger value="produtos">Produtos ({data.produtos.length})</TabsTrigger>
                <TabsTrigger value="clientes">Clientes ({data.clientes.length})</TabsTrigger>
              </TabsList>
              {(["produtos", "clientes"] as const).map((a) => (
                <TabsContent key={a} value={a} className="flex min-h-0 flex-1 flex-col">
                  <ComposicaoTabela
                    data={data}
                    aba={a}
                    mostrarValores={mostrarValores}
                    rotuloTotal={categoria ? "Total da categoria" : "Total"}
                  />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </ResizableSheetContent>
    </Sheet>
  );
}
