"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  ConsultaVendasLinha,
  ConsultaVendasResultado,
} from "@plataforma/contracts";
import { TODOS } from "@/components/consultas/periodo-consulta";
import {
  CortinaParametros,
  Resumo,
  celula,
  moeda,
  useFiltrosConsulta,
  valorExtra,
  type FiltroExtra,
} from "@/components/consultas/filtros-consulta";
import { apiFetch } from "@/lib/api-client";
import {
  exportarConsultaExcel,
  exportarConsultaPdf,
} from "@/lib/consulta-export";
import { useAuthStore } from "@/stores/auth-store";
import { useVendedoresEscopo } from "@/hooks/use-vendedores-escopo";
import { SortableTableHead } from "@/components/crud/sortable-table-head";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, FileText, Search, SlidersHorizontal } from "lucide-react";

export type { FiltroExtra };

/**
 * Colunas ordenáveis: a identificação (nome/descrição), o total do período e a
 * média — ordenar por média responde "quem compra mais por vez", que é outra
 * pergunta que a ordem por total não responde.
 */
type OrdenarPor = "descricao" | "total" | "media";

/**
 * Tela das Consultas de venda: filtros numa cortina lateral, tabela pivô (uma
 * linha por cliente/produto/vendedor, 12 colunas de mês + total) e exportação.
 *
 * As consultas do módulo compartilham este componente — muda só a rota da
 * API, o rótulo da primeira coluna e o filtro extra de categoria. A consulta
 * por categoria não passa por aqui: as linhas dela são uma árvore, não uma
 * lista (ver `consulta-vendas-categoria-view`).
 */
export function ConsultaVendasView({
  titulo,
  rotuloEntidade,
  rota,
  rotina,
  filtroExtra,
}: {
  titulo: string;
  rotuloEntidade: string;
  /** Caminho na API, ex.: "/consultas/vendas-cliente". */
  rota: string;
  /** Código da rotina, para a permissão de exportar. */
  rotina: string;
  filtroExtra?: FiltroExtra;
}) {
  const chavesExtras = useMemo(
    () => (filtroExtra ? [filtroExtra.chave] : []),
    [filtroExtra],
  );
  const estado = useFiltrosConsulta(chavesExtras);
  const { filtros, queryPadrao, quantidadeFiltros, abrirCortina } = estado;

  const [busca, setBusca] = useState("");
  // Ordenação client-side: o ano inteiro já está na mão, e o relatório tem
  // poucas centenas de linhas. Começa pelo maior total, como o back-end
  // devolve.
  const [sortBy, setSortBy] = useState<OrdenarPor>("total");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const podeExportar = useAuthStore((s) => s.hasPermission)(rotina, "exportar");
  const usuario = useAuthStore((s) => s.user);
  const empresaNome = usuario?.empresas.find(
    (e) => e.empresaId === usuario.empresaAtivaId,
  )?.nomeFantasia;

  const vendedores = useVendedoresEscopo();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["consultas", rota, queryPadrao],
    queryFn: () => apiFetch<ConsultaVendasResultado>(rota, { query: queryPadrao }),
  });

  // Um nome cabe no resumo; vários viram contagem, senão a linha estoura.
  const nomeVendedorFiltrado =
    filtros.vendedorIds.length === 0
      ? null
      : filtros.vendedorIds.length === 1
        ? ((vendedores.data?.data ?? []).find((v) => v.id === filtros.vendedorIds[0])
            ?.nomeReduzido ?? null)
        : `${filtros.vendedorIds.length} vendedores`;
  const valorDoExtra = filtroExtra ? valorExtra(filtros, filtroExtra.chave) : TODOS;
  const nomeExtraFiltrado =
    filtroExtra && valorDoExtra !== TODOS
      ? (filtroExtra.opcoes.find((o) => o.id === valorDoExtra)?.descricao ?? null)
      : null;

  const ordenar = useCallback(
    (linhas: ConsultaVendasLinha[]) => {
      const ordenadas = [...linhas].sort((a, b) =>
        sortBy === "descricao"
          ? a.descricao.localeCompare(b.descricao, "pt-BR")
          : sortBy === "media"
            ? a.media - b.media
            : a.total - b.total,
      );
      return sortOrder === "desc" ? ordenadas.reverse() : ordenadas;
    },
    [sortBy, sortOrder],
  );

  // A busca é local: o servidor já devolveu o ano inteiro, e filtrar aqui
  // evita uma ida ao banco a cada tecla. Os totais do rodapé continuam sendo
  // os do resultado completo — o rodapé é do relatório, não do filtro.
  const linhasVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!data) return [];
    const filtradas = termo
      ? data.linhas.filter(
          (l) =>
            l.descricao.toLowerCase().includes(termo) ||
            (l.codigo ?? "").toLowerCase().includes(termo),
        )
      : data.linhas;
    return ordenar(filtradas);
  }, [data, busca, ordenar]);

  const alternarOrdem = (coluna: OrdenarPor) => {
    if (sortBy === coluna) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(coluna);
      // Nome começa de A a Z; valor começa do maior — é o que se espera de
      // cada um.
      setSortOrder(coluna === "descricao" ? "asc" : "desc");
    }
  };

  const exportar = (formato: "pdf" | "excel") => {
    if (!data) return;
    // O arquivo sai na ordem escolhida na tela, mas com o relatório inteiro:
    // a busca é uma lente de consulta, não um recorte do relatório (o rodapé
    // de totais segue a mesma regra).
    const params = {
      resultado: { ...data, linhas: ordenar(data.linhas) },
      titulo,
      rotuloEntidade,
      empresaNome,
    };
    try {
      if (formato === "pdf") exportarConsultaPdf(params);
      else exportarConsultaExcel(params);
    } catch {
      toast.error("Não foi possível gerar o arquivo.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => abrirCortina(true)}>
            <SlidersHorizontal className="size-4" />
            Parâmetros
            {quantidadeFiltros > 0 && (
              <Badge variant="secondary" className="ml-1">
                {quantidadeFiltros}
              </Badge>
            )}
          </Button>
          {podeExportar && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={!data || data.linhas.length === 0}
                onClick={() => exportar("pdf")}
              >
                <FileText className="size-4" />
                PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!data || data.linhas.length === 0}
                onClick={() => exportar("excel")}
              >
                <FileSpreadsheet className="size-4" />
                Excel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Resumo do que está valendo: com os filtros na cortina, a tela
          precisa dizer sozinha de que recorte é o número exibido. */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Resumo label="Período" valor={data?.periodo.label ?? "—"} />
          <Resumo label="Vendedor" valor={nomeVendedorFiltrado ?? "Todos"} />
          {filtroExtra && (
            <Resumo
              label={filtroExtra.label}
              valor={nomeExtraFiltrado ?? filtroExtra.rotuloTodos}
            />
          )}
          <Resumo
            label="Base"
            valor={
              data
                ? data.baseVendedor === "cliente"
                  ? "Vendedor do cliente"
                  : "Vendedor da nota"
                : "—"
            }
          />
          <div className="relative ml-auto w-full sm:max-w-xs">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Buscar ${rotuloEntidade.toLowerCase()} na lista...`}
              className="pl-8"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <CortinaParametros
        estado={estado}
        filtrosExtras={filtroExtra ? [filtroExtra] : []}
      />

      {isLoading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : isError ? (
        <p className="text-sm text-muted-foreground">
          Não foi possível carregar a consulta.
        </p>
      ) : !data || data.linhas.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Nenhuma venda no período com os filtros escolhidos.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {linhasVisiveis.length.toLocaleString("pt-BR")} de{" "}
              {data.linhas.length.toLocaleString("pt-BR")} linhas ·{" "}
              {data.baseVendedor === "cliente"
                ? "vendedor titular do cliente"
                : "vendedor da nota"}
            </p>
            <p className="text-xs text-muted-foreground sm:hidden">
              Deslize a tabela para comparar todos os meses.
            </p>
            <div className="max-h-[70vh] overflow-y-auto rounded-lg border">
              <Table
                className="w-full table-fixed"
                style={{
                  minWidth: Math.max(720, 220 + data.colunas.length * 88),
                }}
              >
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <SortableTableHead
                      label={rotuloEntidade}
                      className="w-[18%] px-2"
                      active={sortBy === "descricao"}
                      order={sortOrder}
                      onClick={() => alternarOrdem("descricao")}
                    />
                    {data.colunas.map((c) => (
                      <TableHead
                        key={c.label}
                        className="px-1.5 text-right text-xs whitespace-nowrap"
                      >
                        {c.label}
                      </TableHead>
                    ))}
                    <SortableTableHead
                      label="Total"
                      className="px-1.5 text-right"
                      active={sortBy === "total"}
                      order={sortOrder}
                      onClick={() => alternarOrdem("total")}
                    />
                    <SortableTableHead
                      label="Média"
                      className="px-1.5 text-right"
                      active={sortBy === "media"}
                      order={sortOrder}
                      onClick={() => alternarOrdem("media")}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhasVisiveis.map((l) => (
                    <TableRow key={l.id}>
                      {/* `whitespace-normal` desfaz o `whitespace-nowrap` que
                          TableCell aplica por padrão: como white-space é
                          herdado, sem isso o `break-words` do parágrafo não
                          tem efeito e o nome do cliente invade a coluna do
                          primeiro mês em vez de quebrar. */}
                      <TableCell className="px-2 align-top whitespace-normal">
                        <p className="text-xs break-words hyphens-auto">
                          {l.descricao}
                        </p>
                        {l.codigo && (
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {l.codigo}
                          </p>
                        )}
                      </TableCell>
                      {l.valores.map((v, i) => (
                        <TableCell
                          key={i}
                          className="px-1.5 text-right align-top text-[11px] tabular-nums"
                        >
                          {celula(v)}
                        </TableCell>
                      ))}
                      <TableCell className="px-1.5 text-right align-top text-[11px] font-medium tabular-nums">
                        {moeda(l.total)}
                      </TableCell>
                      <TableCell className="px-1.5 text-right align-top text-[11px] tabular-nums">
                        {celula(l.media)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot className="sticky bottom-0 z-10 bg-card">
                  <TableRow className="font-medium">
                    <TableCell className="px-2 text-xs">Total geral</TableCell>
                    {data.totais.map((v, i) => (
                      <TableCell
                        key={i}
                        className="px-1.5 text-right text-[11px] tabular-nums"
                      >
                        {celula(v)}
                      </TableCell>
                    ))}
                    <TableCell className="px-1.5 text-right text-[11px] tabular-nums">
                      {moeda(data.total)}
                    </TableCell>
                    <TableCell className="px-1.5 text-right text-[11px] tabular-nums">
                      {celula(data.media)}
                    </TableCell>
                  </TableRow>
                </tfoot>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
