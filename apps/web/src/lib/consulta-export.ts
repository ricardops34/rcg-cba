import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { MESES_LABEL, type ConsultaVendasResultado } from "@plataforma/contracts";

/**
 * Exportação das Consultas de venda (PDF e Excel), montada no navegador a
 * partir do mesmo JSON que alimenta a tela — o servidor não gera arquivo.
 *
 * As duas consultas têm o mesmo formato de linha (entidade + 12 meses +
 * total), então uma função serve as duas; só mudam título e o rótulo da
 * primeira coluna.
 */

export interface ExportParams {
  resultado: ConsultaVendasResultado;
  /** Título do relatório, ex.: "Vendas por Cliente". */
  titulo: string;
  /** Cabeçalho da coluna de identificação, ex.: "Cliente" ou "Produto". */
  rotuloEntidade: string;
  /** Nome fantasia da empresa ativa, impresso no cabeçalho do PDF. */
  empresaNome?: string | null;
}

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "Vendas por Cliente" -> "vendas-por-cliente" (sem acento nem espaço). */
const slug = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Nome do arquivo: vendas-por-cliente-2026-caroline.xlsx */
function nomeArquivo(
  { resultado, titulo }: ExportParams,
  extensao: "pdf" | "xlsx",
): string {
  const partes = [slug(titulo), String(resultado.ano)];
  if (resultado.vendedor) partes.push(slug(resultado.vendedor.nome));
  return `${partes.join("-")}.${extensao}`;
}

/** Linhas do subtítulo: o mesmo texto no PDF e na primeira aba do Excel. */
function descreverFiltros({ resultado }: ExportParams): string[] {
  const linhas = [`Ano: ${resultado.ano}`];
  linhas.push(`Vendedor: ${resultado.vendedor?.nome ?? "Todos"}`);
  if (resultado.categoria) linhas.push(`Categoria: ${resultado.categoria.descricao}`);
  linhas.push(
    resultado.baseVendedor === "cliente"
      ? "Base: vendedor titular do cliente"
      : "Base: vendedor da nota",
  );
  return linhas;
}

/**
 * PDF em paisagem — retrato não comporta as 12 colunas de mês mais o total
 * sem espremer os valores a ponto de quebrar a linha.
 */
export function exportarConsultaPdf(params: ExportParams): void {
  const { resultado, titulo, rotuloEntidade, empresaNome } = params;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const margem = 10;
  let y = margem;

  if (empresaNome) {
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(empresaNome, margem, y);
    y += 5;
  }
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text(titulo, margem, y);
  y += 6;

  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(descreverFiltros(params).join("   ·   "), margem, y);
  y += 2;
  doc.setTextColor(0);

  autoTable(doc, {
    startY: y + 2,
    head: [[rotuloEntidade, ...MESES_LABEL, "Total"]],
    body: resultado.linhas.map((l) => [
      l.codigo ? `${l.codigo} · ${l.descricao}` : l.descricao,
      ...l.meses.map(moeda),
      moeda(l.total),
    ]),
    foot: [
      ["Total geral", ...resultado.totaisMes.map(moeda), moeda(resultado.total)],
    ],
    styles: { fontSize: 6.5, cellPadding: 1 },
    headStyles: { fillColor: [40, 40, 40], fontSize: 6.5 },
    footStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 62 },
      // Mês e total alinhados à direita: número em coluna estreita só se lê
      // comparado pela unidade.
      ...Object.fromEntries(
        Array.from({ length: 13 }, (_, i) => [i + 1, { halign: "right" as const }]),
      ),
    },
    margin: { left: margem, right: margem },
  });

  doc.save(nomeArquivo(params, "pdf"));
}

/**
 * Planilha .xlsx com os valores como número (não texto) — a soma e o filtro
 * do Excel só funcionam assim. A formatação de moeda fica na célula.
 */
export function exportarConsultaExcel(params: ExportParams): void {
  const { resultado, titulo, rotuloEntidade } = params;

  const cabecalho = [rotuloEntidade, "Código", ...MESES_LABEL, "Total"];
  const corpo = resultado.linhas.map((l) => [
    l.descricao,
    l.codigo ?? "",
    ...l.meses,
    l.total,
  ]);
  const rodape = ["Total geral", "", ...resultado.totaisMes, resultado.total];

  // Duas linhas de contexto antes da tabela: sem elas a planilha exportada
  // não diz de que ano/vendedor ela é.
  const linhas = [
    [titulo],
    [descreverFiltros(params).join("   ·   ")],
    [],
    cabecalho,
    ...corpo,
    rodape,
  ];

  const sheet = XLSX.utils.aoa_to_sheet(linhas);
  const primeiraLinhaDados = 4; // 1-based, contando as 3 linhas de contexto
  const totalLinhas = corpo.length + 1; // + rodapé
  for (let l = 0; l < totalLinhas; l++) {
    for (let c = 2; c < cabecalho.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: primeiraLinhaDados + l, c });
      const celula = sheet[ref];
      if (celula && typeof celula.v === "number") celula.z = "#,##0.00";
    }
  }
  sheet["!cols"] = [
    { wch: 45 },
    { wch: 14 },
    ...MESES_LABEL.map(() => ({ wch: 13 })),
    { wch: 15 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Consulta");
  XLSX.writeFile(wb, nomeArquivo(params, "xlsx"));
}
