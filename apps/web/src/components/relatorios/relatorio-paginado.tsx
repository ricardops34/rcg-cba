"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { RELATORIO_TETO_EXPORTACAO, type RelatorioResultado } from "@plataforma/contracts";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { SeletorColunas, linhaDeTotais, useColunasEscolhidas } from "@/components/relatorios/colunas";
import {
  ehNumerica,
  exportarRelatorioExcel,
  exportarRelatorioPdf,
  formatar,
  type ColunaRelatorio,
} from "@/lib/relatorio-export";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";

/** O que a página manda para a API além dos filtros. */
export interface ParametrosPagina {
  page: number;
  pageSize: number;
  ordem?: string;
  sentido: "asc" | "desc";
}

/**
 * Tela de um relatório paginado no servidor (Compras, Vendas): a tabela, os
 * totais do filtro inteiro e os botões de PDF e Excel, que buscam todas as
 * linhas (até o teto) e montam o arquivo no navegador.
 *
 * - **Ordenar** é no servidor (`ordem`/`sentido`): ordenar só a página da
 *   tela mostraria a ordem errada de um relatório de milhares de linhas. O
 *   PDF e o Excel saem na mesma ordem.
 * - **Colunas** escolhidas valem para a tela, o PDF e o Excel.
 *
 * `consulta` são os filtros **aplicados** (o "Gerar" da página); `null`
 * enquanto ninguém gerou — a tela não consulta sozinha ao abrir.
 */
export function RelatorioPaginado<T>({
  titulo,
  rotina,
  chave,
  consulta,
  filtrosTexto,
  buscar,
  colunas,
  rowKey,
}: {
  titulo: string;
  /** Código da rotina: PDF e Excel só com a ação `exportar` dela. */
  rotina: string;
  chave: string;
  consulta: Record<string, unknown> | null;
  /** Período e filtros, para o cabeçalho do PDF e do Excel. */
  filtrosTexto: string[];
  buscar: (p: ParametrosPagina) => Promise<RelatorioResultado<T>>;
  colunas: ColunaRelatorio<T>[];
  rowKey: (linha: T) => string;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [ordem, setOrdem] = useState<{ campo?: string; sentido: "asc" | "desc" }>({ sentido: "asc" });
  const [exportando, setExportando] = useState<"pdf" | "xlsx" | null>(null);
  const podeExportar = useAuthStore((s) => s.hasPermission(rotina, "exportar"));
  const empresaAtiva = useAuthStore((s) => s.user?.empresas.find((e) => e.empresaId === s.user?.empresaAtivaId));
  const empresaNome = empresaAtiva?.nomeFantasia;
  const logoUrl = empresaAtiva?.logoUrl;
  const { visiveis, ocultas, alternar, mostrarTodas } = useColunasEscolhidas(chave, colunas);

  // Filtro novo volta à primeira página.
  const [consultaAnterior, setConsultaAnterior] = useState(consulta);
  if (consultaAnterior !== consulta) {
    setConsultaAnterior(consulta);
    setPage(1);
  }

  const parametros = (p: number, tamanho: number): ParametrosPagina => ({
    page: p,
    pageSize: tamanho,
    ordem: ordem.campo,
    sentido: ordem.sentido,
  });

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["relatorios", chave, consulta, page, pageSize, ordem],
    queryFn: () => buscar(parametros(page, pageSize)),
    enabled: consulta !== null,
    placeholderData: (anterior) => anterior,
  });

  async function exportar(formato: "pdf" | "xlsx") {
    if (!data) return;
    setExportando(formato);
    try {
      const tudo = await buscar(parametros(1, RELATORIO_TETO_EXPORTACAO));
      if (tudo.total > RELATORIO_TETO_EXPORTACAO) {
        toast.warning(
          `O filtro tem ${tudo.total.toLocaleString("pt-BR")} linhas; o arquivo leva as primeiras ${RELATORIO_TETO_EXPORTACAO.toLocaleString("pt-BR")}. Refine o período ou os filtros para ter tudo.`,
        );
      }
      const params = {
        titulo,
        empresaNome,
        logoUrl,
        filtros: filtrosTexto,
        colunas: visiveis,
        linhas: tudo.linhas,
        totais: linhaDeTotais(visiveis, tudo.totais),
      };
      if (formato === "pdf") await exportarRelatorioPdf(params);
      else await exportarRelatorioExcel(params);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o arquivo.");
    } finally {
      setExportando(null);
    }
  }

  const colunasTabela: ColumnDef<T>[] = visiveis.map((c) => ({
    id: c.campo,
    header: c.titulo,
    sortKey: c.campo,
    className: ehNumerica(c.formato) ? "text-right whitespace-nowrap" : undefined,
    cell: (l) => formatar(c.valor(l), c.formato),
  }));

  if (consulta === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Escolha o período e os filtros e clique em <strong>Gerar</strong>.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            {data ? `${data.total.toLocaleString("pt-BR")} linhas` : "Carregando..."}
            {isFetching && !isLoading && <Loader2 className="ml-2 inline size-3 animate-spin" />}
          </span>
          {data &&
            data.total > 0 &&
            colunas
              .filter((c) => c.campo in data.totais)
              .map((c) => (
                <span key={c.campo}>
                  <span className="text-muted-foreground">{c.titulo}: </span>
                  <strong>{formatar(data.totais[c.campo], c.formato)}</strong>
                </span>
              ))}
        </div>
        <SeletorColunas colunas={colunas} ocultas={ocultas} alternar={alternar} mostrarTodas={mostrarTodas} />
        {podeExportar && (
          <>
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={!data || data.total === 0 || !!exportando}
              onClick={() => void exportar("pdf")}
            >
              {exportando === "pdf" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
              PDF
            </Button>
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={!data || data.total === 0 || !!exportando}
              onClick={() => void exportar("xlsx")}
            >
              {exportando === "xlsx" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="size-4" />
              )}
              Excel
            </Button>
          </>
        )}
      </div>

      <EntityTable
        columns={colunasTabela}
        rows={data?.linhas ?? []}
        rowKey={rowKey}
        isLoading={isLoading}
        error={error}
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? pageSize}
        total={data?.total ?? 0}
        totalPages={data?.totalPages ?? 1}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        sortBy={ordem.campo}
        sortOrder={ordem.sentido}
        onSortChange={(campo, sentido) => {
          setOrdem({ campo, sentido });
          setPage(1);
        }}
        emptyMessage="Nada encontrado para o período e os filtros."
      />
    </div>
  );
}
