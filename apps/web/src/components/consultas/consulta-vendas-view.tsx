"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  MESES_LABEL,
  type ConsultaVendasLinha,
  type ConsultaVendasResultado,
} from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import {
  exportarConsultaExcel,
  exportarConsultaPdf,
} from "@/lib/consulta-export";
import { useAuthStore } from "@/stores/auth-store";
import { useVendedoresEscopo, vendedorFiltroLabel } from "@/hooks/use-vendedores-escopo";
import { SortableTableHead } from "@/components/crud/sortable-table-head";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileSpreadsheet, FileText, Search } from "lucide-react";

/** Valor "todos" dos selects — Radix não aceita SelectItem com value="". */
export const TODOS = "todos";

/** Colunas ordenáveis: a identificação (nome/descrição) e o total do ano. */
type OrdenarPor = "descricao" | "total";

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Zero em coluna de mês vira "—": a tabela tem 13 colunas numéricas e o
 *  olho precisa achar onde houve venda. */
const celula = (v: number) => (v === 0 ? "—" : moeda(v));

/** Últimos 6 anos + o atual, do mais recente para o mais antigo. */
export function anosDisponiveis(): number[] {
  const atual = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, i) => atual - i);
}

export interface FiltroExtra {
  /** Rótulo do select adicional (ex.: "Categoria"). */
  label: string;
  valor: string;
  onChange: (v: string) => void;
  opcoes: { id: string; descricao: string }[];
  carregando?: boolean;
}

/**
 * Tela das Consultas de venda: filtros no topo, tabela pivô (uma linha por
 * cliente/produto, 12 colunas de mês + total) e exportação.
 *
 * As duas consultas do módulo compartilham este componente — muda só a rota
 * da API, o rótulo da primeira coluna e o filtro extra de categoria.
 */
export function ConsultaVendasView({
  titulo,
  rotuloEntidade,
  rota,
  rotina,
  filtroExtra,
  queryExtra,
}: {
  titulo: string;
  rotuloEntidade: string;
  /** Caminho na API, ex.: "/consultas/vendas-cliente". */
  rota: string;
  /** Código da rotina, para a permissão de exportar. */
  rotina: string;
  filtroExtra?: FiltroExtra;
  /** Parâmetros extras da consulta (ex.: categoriaId). */
  queryExtra?: Record<string, string | undefined>;
}) {
  const anos = useMemo(() => anosDisponiveis(), []);
  const [ano, setAno] = useState(() => String(anos[0]));
  const [vendedorId, setVendedorId] = useState(TODOS);
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

  const query = {
    ano,
    vendedorId: vendedorId === TODOS ? undefined : vendedorId,
    ...queryExtra,
  };
  const { data, isLoading, isError } = useQuery({
    queryKey: ["consultas", rota, query],
    queryFn: () => apiFetch<ConsultaVendasResultado>(rota, { query }),
  });

  const ordenar = useCallback(
    (linhas: ConsultaVendasLinha[]) => {
      const ordenadas = [...linhas].sort((a, b) =>
        sortBy === "descricao"
          ? a.descricao.localeCompare(b.descricao, "pt-BR")
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
        {podeExportar && (
          <div className="flex gap-2">
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
          </div>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Ano</p>
            <Select value={ano} onValueChange={setAno}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anos.map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Vendedor</p>
            <Select value={vendedorId} onValueChange={setVendedorId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {(vendedores.data?.data ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {vendedorFiltroLabel(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtroExtra && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{filtroExtra.label}</p>
              <Select value={filtroExtra.valor} onValueChange={filtroExtra.onChange}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas</SelectItem>
                  {filtroExtra.opcoes.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="relative w-full sm:max-w-xs">
            <p className="mb-1 text-xs text-muted-foreground">Buscar na lista</p>
            <Search className="absolute bottom-2.5 left-2.5 size-3.5 text-muted-foreground" />
            <Input
              placeholder={`Filtrar ${rotuloEntidade.toLowerCase()}...`}
              className="pl-8"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

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
            {/* Sem rolagem horizontal: a tabela é `table-fixed`, a coluna de
                identificação leva 18% e quebra em várias linhas, e as 13
                colunas de valor dividem o resto. Em tela estreita o que
                acontece é o texto quebrar em mais linhas — nunca aparecer
                barra horizontal. */}
            <div className="max-h-[70vh] overflow-x-hidden overflow-y-auto rounded-lg border">
              <Table className="w-full table-fixed">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <SortableTableHead
                      label={rotuloEntidade}
                      className="w-[18%] px-2"
                      active={sortBy === "descricao"}
                      order={sortOrder}
                      onClick={() => alternarOrdem("descricao")}
                    />
                    {MESES_LABEL.map((m) => (
                      <TableHead key={m} className="px-1.5 text-right text-xs">
                        {m}
                      </TableHead>
                    ))}
                    <SortableTableHead
                      label="Total"
                      // O botão do cabeçalho é flex block-level: alinhar o
                      // rótulo à direita exige largura cheia + justify-end.
                      className="w-[8%] px-1.5 [&>button]:w-full [&>button]:justify-end"
                      active={sortBy === "total"}
                      order={sortOrder}
                      onClick={() => alternarOrdem("total")}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhasVisiveis.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="px-2 align-top">
                        <p className="text-xs break-words hyphens-auto">
                          {l.descricao}
                        </p>
                        {l.codigo && (
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {l.codigo}
                          </p>
                        )}
                      </TableCell>
                      {l.meses.map((v, i) => (
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
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot className="sticky bottom-0 z-10 bg-card">
                  <TableRow className="font-medium">
                    <TableCell className="px-2 text-xs">Total geral</TableCell>
                    {data.totaisMes.map((v, i) => (
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
