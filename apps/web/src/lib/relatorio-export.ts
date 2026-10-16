import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import { assetUrl } from "@/lib/api-client";

/**
 * Exportação dos Relatórios (PDF e Excel), montada no navegador a partir do
 * mesmo JSON da tela — o padrão de `consulta-export.ts`. Cada relatório
 * descreve as colunas uma vez (`ColunaRelatorio`), e a tela, o PDF e o Excel
 * saem delas.
 */

export type FormatoColuna = "texto" | "numero" | "quantidade" | "moeda" | "percentual" | "data";

export interface ColunaRelatorio<T> {
  /**
   * Campo da linha: a ordenação no servidor, a escolha de colunas guardada no
   * navegador e o total (`totais[campo]`) saem dele.
   */
  campo: string;
  titulo: string;
  valor: (linha: T) => string | number | null;
  formato?: FormatoColuna;
  /** Centraliza a coluna (tela, PDF e Excel) — ex.: estoque, quantidade, unidade. */
  centralizar?: boolean;
}

const NUMERICOS: FormatoColuna[] = ["numero", "quantidade", "moeda", "percentual"];
export const ehNumerica = (f?: FormatoColuna) => !!f && NUMERICOS.includes(f);

export const alinhamento = (c?: { formato?: FormatoColuna; centralizar?: boolean }) =>
  c?.centralizar ? "center" : ehNumerica(c?.formato) ? "right" : "left";

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
      return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
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
  /** Caminho do logo da empresa ativa (`user.empresas[].logoUrl`) — PNG/JPEG. */
  logoUrl?: string | null;
  /** Linhas de contexto: período e filtros aplicados. */
  filtros: string[];
  colunas: ColunaRelatorio<T>[];
  linhas: T[];
  /** Linha de totais, alinhada às colunas (null = célula vazia). */
  totais?: (string | number | null)[];
  /** Excel: linha em negrito (ex.: subtotal e total). */
  negritoNoExcel?: (linha: T) => boolean;
  /** Excel: deixa uma linha vazia depois desta (ex.: após o subtotal). */
  linhaVaziaAposNoExcel?: (linha: T) => boolean;
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

const AZUL = "FF1E40AF";
const AZUL_RGB: [number, number, number] = [30, 64, 175];
const CINZA_CLARO = "FFF1F5F9";
const BRANCO = "FFFFFFFF";
const TEXTO_CLARO = "FF64748B";

const NUM_FMT: Record<FormatoColuna, string | undefined> = {
  texto: undefined,
  data: undefined,
  numero: "#,##0.00",
  quantidade: "#,##0",
  // Contábil: "R$" à esquerda da célula, valor à direita, zero como "-".
  moeda: '_("R$"* #,##0.00_);_("R$"* (#,##0.00);_("R$"* "-"??_);_(@_)',
  // O valor já é em pontos percentuais (3,25 = 3,25%): "%" literal, sem o ×100 do formato `0.00%`.
  percentual: '0.00"%"',
};

export function arrayBufferParaBase64(buffer: ArrayBuffer): string {
  let binario = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario);
}

/** Extensão do arquivo de logo pelo `Content-Type` da resposta — o nome vem com hash, sem extensão confiável. */
export async function baixarLogo(
  logoUrl: string | null | undefined,
): Promise<{ buffer: ArrayBuffer; extensao: "png" | "jpeg" } | null> {
  const url = assetUrl(logoUrl);
  if (!url) return null;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const tipo = resp.headers.get("content-type") ?? "";
    const extensao = tipo.includes("png") ? "png" : tipo.includes("jpeg") || tipo.includes("jpg") ? "jpeg" : null;
    if (!extensao) return null;
    return { buffer: await resp.arrayBuffer(), extensao };
  } catch {
    return null;
  }
}

/**
 * PDF em paisagem: os relatórios têm 10 a 12 colunas. Cabeçalho de cada
 * página leva só a logo, a empresa e o título — período e filtros vão numa
 * página de "Parâmetros" própria, no final, para não repetir texto a cada
 * página do corpo.
 */
export async function exportarRelatorioPdf<T>(p: ExportRelatorio<T>): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const margem = 10;
  const logo = await baixarLogo(p.logoUrl);
  const logoDataUrl = logo
    ? `data:image/${logo.extensao};base64,${arrayBufferParaBase64(logo.buffer)}`
    : null;

  const cabecalho = () => {
    let x = margem;
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, logo!.extensao.toUpperCase(), margem, margem - 2, 0, 12);
        x = margem + 30;
      } catch {
        // logo corrompida ou formato que o jsPDF não embute: segue sem imagem.
      }
    }
    doc.setFontSize(14);
    doc.setTextColor(20);
    doc.text(p.titulo, x, margem + 4);
    if (p.empresaNome) {
      doc.setFontSize(9);
      doc.setTextColor(110);
      doc.text(p.empresaNome, x, margem + 9);
    }
  };
  cabecalho();
  const y = margem + 16;

  const corpo = p.linhas.map((l) => p.colunas.map((c) => formatar(c.valor(l), c.formato)));
  const totais = p.totais?.map((v, i) => formatar(v, p.colunas[i]?.formato));
  autoTable(doc, {
    startY: y,
    margin: { left: margem, right: margem, top: margem + 16 },
    head: [p.colunas.map((c) => c.titulo)],
    body: corpo,
    foot: totais ? [totais] : undefined,
    styles: { fontSize: 7, cellPadding: 1.2, overflow: "linebreak" },
    headStyles: { fillColor: AZUL_RGB, textColor: 255 },
    footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
    columnStyles: Object.fromEntries(
      p.colunas.map((c, i) => [i, { halign: alinhamento(c) }]),
    ),
    didDrawPage: (dados) => {
      if (dados.pageNumber > 1) cabecalho();
      const paginas = doc.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text(`Página ${paginas}`, doc.internal.pageSize.getWidth() - margem - 15, doc.internal.pageSize.getHeight() - 5);
    },
  });

  // Página de parâmetros, no final: período, filtros e emissão — separada do
  // corpo para não repetir a cada página de uma listagem longa.
  doc.addPage();
  let py = margem;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, logo!.extensao.toUpperCase(), margem, py, 0, 18);
    } catch {
      // segue sem imagem
    }
  }
  py += 24;
  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text("Parâmetros do relatório", margem, py);
  py += 7;
  if (p.empresaNome) {
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(p.empresaNome, margem, py);
    py += 8;
  } else {
    py += 3;
  }
  doc.setFontSize(10);
  doc.setTextColor(30);
  doc.text(p.titulo, margem, py);
  py += 8;
  doc.setFontSize(9);
  doc.setTextColor(60);
  for (const linha of p.filtros) {
    doc.text(linha, margem, py);
    py += 5;
  }
  py += 2;
  doc.setTextColor(120);
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, margem, py);

  doc.save(nomeArquivo(p.titulo, "pdf"));
}

/**
 * Aba "Parâmetros": o que foi pedido (empresa, período, filtros) — para quem
 * recebe a planilha conferir sem precisar voltar à tela.
 */
function montarAbaParametros<T>(
  livro: ExcelJS.Workbook,
  p: Pick<ExportRelatorio<T>, "titulo" | "empresaNome" | "filtros">,
  logo: { buffer: ArrayBuffer; extensao: "png" | "jpeg" } | null,
) {
  const aba = livro.addWorksheet("Parâmetros");
  aba.columns = [{ width: 22 }, { width: 70 }];

  let linha = 1;
  if (logo) {
    // `buffer` no tipo do ExcelJS é o Buffer do Node; no navegador, só `base64`.
    const imagemId = livro.addImage({
      base64: `data:image/${logo.extensao};base64,${arrayBufferParaBase64(logo.buffer)}`,
      extension: logo.extensao,
    });
    aba.addImage(imagemId, { tl: { col: 0, row: 0 }, ext: { width: 160, height: 60 } });
    linha = 5;
  }

  const titulo = aba.getCell(`A${linha}`);
  titulo.value = p.titulo;
  titulo.font = { size: 16, bold: true, color: { argb: "FF0F172A" } };
  aba.mergeCells(`A${linha}:B${linha}`);
  linha += 1;

  if (p.empresaNome) {
    const empresa = aba.getCell(`A${linha}`);
    empresa.value = p.empresaNome;
    empresa.font = { size: 11, color: { argb: TEXTO_CLARO } };
    aba.mergeCells(`A${linha}:B${linha}`);
    linha += 2;
  } else {
    linha += 1;
  }

  const linhaCabecalho = aba.getRow(linha);
  linhaCabecalho.getCell(1).value = "Parâmetro";
  linhaCabecalho.getCell(2).value = "Valor";
  linhaCabecalho.eachCell((cel) => {
    cel.font = { bold: true, color: { argb: BRANCO } };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    cel.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });
  linha += 1;

  const pares = p.filtros.map((f) => {
    const i = f.indexOf(":");
    return i === -1 ? [f, ""] : [f.slice(0, i).trim(), f.slice(i + 1).trim()];
  });
  pares.push(["Emitido em", new Date().toLocaleString("pt-BR")]);

  for (const [rotulo, valor] of pares) {
    const row = aba.getRow(linha);
    row.getCell(1).value = rotulo;
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = valor;
    row.eachCell((cel) => {
      cel.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      cel.alignment = { vertical: "middle", wrapText: true };
    });
    linha += 1;
  }
}

/** Aba "Relatório": cabeçalho fixo, filtro automático, totais e formato numérico nativo (soma/filtro funcionam na planilha). */
function montarAbaRelatorio<T>(
  livro: ExcelJS.Workbook,
  p: ExportRelatorio<T>,
  logo: { buffer: ArrayBuffer; extensao: "png" | "jpeg" } | null,
) {
  const aba = livro.addWorksheet("Relatório");

  // Quantidade: "#,##0.####" deixa a vírgula pendurada ("112,") quando não há
  // decimal. O formato acompanha as casas que a coluna realmente usa (até 4).
  const formatoQuantidade = p.colunas.map((c) => {
    if (c.formato !== "quantidade") return undefined;
    let casas = 0;
    for (const l of p.linhas) {
      const v = c.valor(l);
      if (typeof v !== "number") continue;
      const dec = (String(Math.round(v * 1e4) / 1e4).split(".")[1] ?? "").length;
      if (dec > casas) casas = dec;
    }
    return casas ? `#,##0.${"0".repeat(casas)}` : "#,##0";
  });
  aba.columns = p.colunas.map((c) => ({
    key: c.campo,
    width: ehNumerica(c.formato) ? 14 : Math.max(12, c.titulo.length + 2),
    style: { numFmt: NUM_FMT[c.formato ?? "texto"] },
  }));

  // Com logo, o cabeçalho da tabela desce para a linha 5 e a logo ocupa o topo.
  const linhaCab = logo ? 5 : 1;
  if (logo) inserirLogo(livro, aba, logo);
  const cabecalho = aba.getRow(linhaCab);
  p.colunas.forEach((c, i) => (cabecalho.getCell(i + 1).value = c.titulo));
  cabecalho.eachCell((cel) => {
    cel.font = { bold: true, color: { argb: BRANCO } };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    cel.alignment = { vertical: "middle" };
  });
  cabecalho.height = 20;

  p.linhas.forEach((l, i) => {
    const valores = p.colunas.map((c) => {
      const v = c.valor(l);
      if (v === null || v === undefined) return null;
      if (c.formato === "data" && typeof v === "string") return dataBr(v);
      return v;
    });
    const row = aba.addRow(valores);
    row.eachCell((cel, col) => {
      cel.alignment = { horizontal: alinhamento(p.colunas[col - 1]) };
      const fq = formatoQuantidade[col - 1];
      if (fq) cel.numFmt = fq;
      if (i % 2 === 1) cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA_CLARO } };
      if (p.negritoNoExcel?.(l)) cel.font = { bold: true };
    });
    if (p.linhaVaziaAposNoExcel?.(l)) aba.addRow([]);
  });

  if (p.totais) {
    const row = aba.addRow(p.totais.map((v) => v ?? null));
    row.eachCell((cel, col) => {
      cel.font = { bold: true };
      cel.border = { top: { style: "double", color: { argb: "FF94A3B8" } } };
      cel.alignment = { horizontal: alinhamento(p.colunas[col - 1]) };
      const fq = formatoQuantidade[col - 1];
      if (fq) cel.numFmt = fq;
    });
  }

  aba.autoFilter = { from: { row: linhaCab, column: 1 }, to: { row: linhaCab, column: p.colunas.length } };
  aba.views = [{ state: "frozen", ySplit: linhaCab }];
}

/**
 * Excel formatado: aba "Parâmetros" (empresa, logo, período e filtros
 * aplicados) e aba "Relatório" (cabeçalho fixo, filtro automático, zebra e
 * números nativos — soma e filtro funcionam na planilha).
 */
export async function exportarRelatorioExcel<T>(p: ExportRelatorio<T>): Promise<void> {
  const [livro, logo] = await Promise.all([Promise.resolve(new ExcelJS.Workbook()), baixarLogo(p.logoUrl)]);
  livro.creator = p.empresaNome ?? "Plataforma";
  livro.created = new Date();

  montarAbaParametros(livro, p, logo);
  montarAbaRelatorio(livro, p, logo);

  await baixarLivro(livro, nomeArquivo(p.titulo, "xlsx"));
}

/** Logo no topo da aba (4 linhas reservadas). */
export function inserirLogo(
  livro: ExcelJS.Workbook,
  aba: ExcelJS.Worksheet,
  logo: { buffer: ArrayBuffer; extensao: "png" | "jpeg" },
) {
  const imagemId = livro.addImage({
    base64: `data:image/${logo.extensao};base64,${arrayBufferParaBase64(logo.buffer)}`,
    extension: logo.extensao,
  });
  aba.addImage(imagemId, { tl: { col: 0, row: 0 }, ext: { width: 160, height: 60 } });
}

export async function baixarLivro(livro: ExcelJS.Workbook, nome: string): Promise<void> {
  const buffer = await livro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}
