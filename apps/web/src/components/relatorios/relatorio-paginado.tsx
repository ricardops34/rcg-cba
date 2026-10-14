"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { RELATORIO_TETO_EXPORTACAO, type RelatorioResultado } from "@plataforma/contracts";
import { EntityTable, type ColumnDef } from "@/components/crud/entity-table";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import {
  ehNumerica,
  exportarRelatorioExcel,
  exportarRelatorioPdf,
  formatar,
  type ColunaRelatorio,
} from "@/lib/relatorio-export";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";

/**
 * Tela de um relatório paginado no servidor (Compras, Vendas): a tabela, a
 * linha de totais do filtro inteiro e os botões de PDF e Excel, que buscam
 * todas as linhas (até o teto) e montam o arquivo no navegador.
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
  totais,
}: {
  titulo: string;
  /** Código da rotina: PDF e Excel só com a ação `exportar` dela. */
  rotina: string;
  chave: string;
  consulta: Record<string, unknown> | null;
  /** Período e filtros, para o cabeçalho do PDF e do Excel. */
  filtrosTexto: string[];
  buscar: (page: number, pageSize: number) => Promise<RelatorioResultado<T>>;
  colunas: ColunaRelatorio<T>[];
  rowKey: (linha: T) => string;
  /** A linha de totais, alinhada às colunas. */
  totais: (r: RelatorioResultado<T>) => (string | number | null)[];
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [exportando, setExportando] = useState<"pdf" | "xlsx" | null>(null);
  const podeExportar = useAuthStore((s) => s.hasPermission(rotina, "exportar"));
  const empresaNome = useAuthStore(
    (s) => s.user?.empresas.find((e) => e.empresaId === s.user?.empresaAtivaId)?.nomeFantasia,
  );

  // Filtro novo volta à primeira página.
  const [consultaAnterior, setConsultaAnterior] = useState(consulta);
  if (consultaAnterior !== consulta) {
    setConsultaAnterior(consulta);
    setPage(1);
  }

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["relatorios", chave, consulta, page, pageSize],
    queryFn: () => buscar(page, pageSize),
    enabled: consulta !== null,
  });

  async function exportar(formato: "pdf" | "xlsx") {
    if (!data) return;
    setExportando(formato);
    try {
      const tudo = await buscar(1, RELATORIO_TETO_EXPORTACAO);
      if (tudo.total > RELATORIO_TETO_EXPORTACAO) {
        toast.warning(
          `O filtro tem ${tudo.total.toLocaleString("pt-BR")} linhas; o arquivo leva as primeiras ${RELATORIO_TETO_EXPORTACAO.toLocaleString("pt-BR")}. Refine o período ou os filtros para ter tudo.`,
        );
      }
      const params = {
        titulo,
        empresaNome,
        filtros: filtrosTexto,
        colunas,
        linhas: tudo.linhas,
        totais: totais(tudo),
      };
      if (formato === "pdf") exportarRelatorioPdf(params);
      else exportarRelatorioExcel(params);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o arquivo.");
    } finally {
      setExportando(null);
    }
  }

  const colunasTabela: ColumnDef<T>[] = colunas.map((c) => ({
    header: c.titulo,
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

  const linhaTotais = data ? totais(data) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">
          {data ? `${data.total.toLocaleString("pt-BR")} linhas` : "Carregando..."}
          {isFetching && !isLoading && <Loader2 className="ml-2 inline size-3 animate-spin" />}
        </p>
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

      {linhaTotais && data && data.total > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          {colunas.map((c, i) =>
            ehNumerica(c.formato) && linhaTotais[i] !== null && linhaTotais[i] !== "" ? (
              <span key={c.titulo}>
                <span className="text-muted-foreground">{c.titulo}: </span>
                <strong>{formatar(linhaTotais[i], c.formato)}</strong>
              </span>
            ) : null,
          )}
        </div>
      )}

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
        emptyMessage="Nada encontrado para o período e os filtros."
      />
    </div>
  );
}
