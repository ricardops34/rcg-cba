import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

/**
 * Exportação dos Relatórios (PDF e Excel), montada no navegador a partir do
 * mesmo JSON da tela — o padrão de `consulta-export.ts`. Cada relatório
 * descreve as colunas uma vez (`ColunaRelatorio`), e a tela, o PDF e o Excel
 * saem delas.
 */

export type FormatoColuna = "texto" | "numero" | "quantidade" | "moeda" | "percentual" | "data";

export interface ColunaRelatorio<T> {
  titulo: string;
  valor: (linha: T) => string | number | null;
  formato?: FormatoColuna;
}

const NUMERICOS: FormatoColuna[] = ["numero", "quantidade", "moeda", "percentual"];
export const ehNumerica = (f?: FormatoColuna) => !!f && NUMERICOS.includes(f);

/** `2026-01-07` → `07/01/2026` (data civil, sem fuso). */
const dataBr = (v: string) => {
  const [a, m, d] = v.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : v;
};

export function formatar(valor: string | number | null, formato: FormatoColuna = "texto"): string {
  if (valor === null || valor === undefined || valor === "") return "";
  if (typeof valor === "string") return formato === "data" ? dataBr(valor) : valor;
  switch (formato) {
    case "moeda":
      return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    case "percentual":
    case "numero":
      return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "quantidade":
      return valor.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
    default:
      return String(valor);
  }
}

export interface ExportRelatorio<T> {
  titulo: string;
  empresaNome?: string | null;
  /** Linhas de contexto: período e filtros aplicados. */
  filtros: string[];
  colunas: ColunaRelatorio<T>[];
  linhas: T[];
  /** Linha de totais, alinhada às colunas (null = célula vazia). */
  totais?: (string | number | null)[];
}

const slug = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const nomeArquivo = (titulo: string, extensao: string) =>
  `${slug(titulo)}-${new Date().toISOString().slice(0, 10)}.${extensao}`;

/** PDF em paisagem: os relatórios têm 10 a 12 colunas. */
export function exportarRelatorioPdf<T>(p: ExportRelatorio<T>): void {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const margem = 10;
  let y = margem;
  if (p.empresaNome) {
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(p.empresaNome, margem, y);
    y += 5;
  }
  doc.setFontSize(14);
  doc.setTextColor(20);
  doc.text(p.titulo, margem, y + 2);
  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(90);
  for (const linha of p.filtros) {
    doc.text(linha, margem, y);
    y += 4;
  }
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, margem, y);
  y += 3;

  const corpo = p.linhas.map((l) => p.colunas.map((c) => formatar(c.valor(l), c.formato)));
  const totais = p.totais?.map((v, i) => formatar(v, p.colunas[i]?.formato));
  autoTable(doc, {
    startY: y + 2,
    margin: { left: margem, right: margem },
    head: [p.colunas.map((c) => c.titulo)],
    body: corpo,
    foot: totais ? [totais] : undefined,
    styles: { fontSize: 7, cellPadding: 1.2, overflow: "linebreak" },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
    columnStyles: Object.fromEntries(
      p.colunas.map((c, i) => [i, { halign: ehNumerica(c.formato) ? "right" : "left" }]),
    ),
    didDrawPage: () => {
      const paginas = doc.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text(`Página ${paginas}`, doc.internal.pageSize.getWidth() - margem - 15, doc.internal.pageSize.getHeight() - 5);
    },
  });
  doc.save(nomeArquivo(p.titulo, "pdf"));
}

/**
 * Excel: número como número (soma e filtro funcionam na planilha), data como
 * texto dd/mm/aaaa. Primeiro as linhas de contexto, depois a tabela.
 */
export function exportarRelatorioExcel<T>(p: ExportRelatorio<T>): void {
  const contexto = [[p.titulo], ...(p.empresaNome ? [[p.empresaNome]] : []), ...p.filtros.map((f) => [f]), []];
  const cabecalho = p.colunas.map((c) => c.titulo);
  const corpo = p.linhas.map((l) =>
    p.colunas.map((c) => {
      const v = c.valor(l);
      if (v === null || v === undefined) return "";
      if (c.formato === "data" && typeof v === "string") return dataBr(v);
      return v;
    }),
  );
  const totais = p.totais ? [p.totais.map((v) => v ?? "")] : [];
  const planilha = XLSX.utils.aoa_to_sheet([...contexto, cabecalho, ...corpo, ...totais]);
  planilha["!cols"] = p.colunas.map((c) => ({ wch: ehNumerica(c.formato) ? 14 : Math.max(12, c.titulo.length + 2) }));
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, "Relatório");
  XLSX.writeFile(livro, nomeArquivo(p.titulo, "xlsx"));
}
