import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type {
  ConsultaVendasLinha,
  ConsultaVendasResultado,
} from "@plataforma/contracts";

/**
 * Exportação das Consultas de venda (PDF e Excel), montada no navegador a
 * partir do mesmo JSON que alimenta a tela — o servidor não gera arquivo.
 *
 * As consultas têm o mesmo formato de linha (entidade + até 12 meses + total +
 * média dos meses com movimento), então uma função serve todas; só mudam
 * título e o rótulo da primeira coluna.
 */

/**
 * Uma linha do arquivo. Os dois campos extras só existem nas consultas em
 * árvore (vendas por categoria): `nivel` é a profundidade, que vira
 * indentação, e `rotuloNivel` é o que a linha é ("Categoria", "Produto"...).
 *
 * São coisas separadas de propósito: a tela suprime o degrau da subcategoria
 * quando nenhum produto da categoria tem uma, e ali um produto aparece na
 * profundidade 1 sem deixar de ser produto.
 */
export interface LinhaExportavel extends ConsultaVendasLinha {
  nivel?: number;
  rotuloNivel?: string;
}

export interface ExportParams {
  resultado: Omit<ConsultaVendasResultado, "linhas"> & {
    linhas: LinhaExportavel[];
  };
  /** Título do relatório, ex.: "Vendas por Cliente". */
  titulo: string;
  /** Cabeçalho da coluna de identificação, ex.: "Cliente" ou "Produto". */
  rotuloEntidade: string;
  /** Nome fantasia da empresa ativa, impresso no cabeçalho do PDF. */
  empresaNome?: string | null;
  /**
   * O que os números são. `moeda` (padrão) sai com dois decimais; `quantidade`
   * é contagem de clientes, e sai inteira — na consulta de evolução as duas
   * aparecem, conforme o indicador escolhido.
   */
  formato?: "moeda" | "quantidade";
  /** Linhas extras de contexto no subtítulo, ex.: o indicador da evolução. */
  contextoExtra?: string[];
  /**
   * Cabeçalho da coluna que diz o que cada linha é (ex.: "Nível"). Presente,
   * o arquivo sai como árvore: descrição indentada e essa coluna preenchida
   * com o `rotuloNivel` de cada linha. Sem ela, uma planilha reordenada por
   * total misturaria categoria com produto, e quem somasse a coluna contaria
   * a mesma venda três vezes.
   */
  colunaNivel?: string;
}

/** Indentação da descrição no arquivo, proporcional ao nível do nó. */
const indentar = (l: LinhaExportavel) => "      ".repeat(l.nivel ?? 0);

/** Formatador dos valores conforme o formato do relatório. */
const formatador = (formato: ExportParams["formato"]) => (v: number) =>
  formato === "quantidade"
    ? v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
    : v.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

/** "Vendas por Cliente" -> "vendas-por-cliente" (sem acento nem espaço). */
const slug = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Nome do arquivo: vendas-por-cliente-jan26-jul26-caroline.xlsx */
function nomeArquivo(
  { resultado, titulo }: ExportParams,
  extensao: "pdf" | "xlsx",
): string {
  const { colunas } = resultado;
  const partes = [slug(titulo)];
  if (colunas.length > 0) {
    partes.push(slug(colunas[0].label));
    if (colunas.length > 1) partes.push(slug(colunas[colunas.length - 1].label));
  }
  // Um vendedor entra no nome do arquivo; vários viram a contagem, senão o
  // nome do arquivo fica impronunciável (e estoura o limite do sistema).
  if (resultado.vendedores.length === 1) {
    partes.push(slug(resultado.vendedores[0].nome));
  } else if (resultado.vendedores.length > 1) {
    partes.push(`${resultado.vendedores.length}-vendedores`);
  }
  return `${partes.join("-")}.${extensao}`;
}

/** Linhas do subtítulo: o mesmo texto no PDF e na primeira aba do Excel. */
function descreverFiltros({ resultado, contextoExtra }: ExportParams): string[] {
  const linhas = [`Período: ${resultado.periodo.label}`];
  // O relatório precisa dizer de quem é o número. Até três nomes cabem no
  // subtítulo; acima disso, a contagem — a lista inteira empurraria a tabela
  // para a segunda página.
  const vendedores = resultado.vendedores;
  linhas.push(
    vendedores.length === 0
      ? "Vendedor: Todos"
      : vendedores.length <= 3
        ? `Vendedor: ${vendedores.map((v) => v.nome).join(", ")}`
        : `Vendedor: ${vendedores.length} selecionados`,
  );
  if (resultado.categoria) linhas.push(`Categoria: ${resultado.categoria.descricao}`);
  linhas.push(
    resultado.baseVendedor === "cliente"
      ? "Base: vendedor titular do cliente"
      : "Base: vendedor da nota",
  );
  return [...linhas, ...(contextoExtra ?? [])];
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

  const valor = formatador(params.formato);
  const rotulosMes = resultado.colunas.map((c) => c.label);
  autoTable(doc, {
    startY: y + 2,
    head: [[rotuloEntidade, ...rotulosMes, "Total", "Média"]],
    body: resultado.linhas.map((l) => [
      indentar(l) + (l.codigo ? `${l.codigo} · ${l.descricao}` : l.descricao),
      ...l.valores.map(valor),
      valor(l.total),
      valor(l.media),
    ]),
    foot: [
      [
        "Total geral",
        ...resultado.totais.map(valor),
        valor(resultado.total),
        valor(resultado.media),
      ],
    ],
    styles: { fontSize: 6.5, cellPadding: 1 },
    headStyles: { fillColor: [40, 40, 40], fontSize: 6.5 },
    footStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 62 },
      // Mês, total e média alinhados à direita: número em coluna estreita só
      // se lê comparado pela unidade.
      ...Object.fromEntries(
        Array.from({ length: rotulosMes.length + 2 }, (_, i) => [
          i + 1,
          { halign: "right" as const },
        ]),
      ),
    },
    margin: { left: margem, right: margem },
    // Numa árvore, a linha de categoria é o resumo das que vêm abaixo dela.
    // Sem peso diferente por nível o PDF vira uma parede de números em que
    // não se distingue o agrupamento do detalhe.
    didParseCell: ({ section, row, cell }) => {
      if (section !== "body" || !params.colunaNivel) return;
      const nivel = resultado.linhas[row.index]?.nivel ?? 0;
      if (nivel === 0) cell.styles.fontStyle = "bold";
      else if (nivel > 1) cell.styles.textColor = 110;
    },
  });

  doc.save(nomeArquivo(params, "pdf"));
}

/**
 * Planilha .xlsx com os valores como número (não texto) — a soma e o filtro
 * do Excel só funcionam assim. A formatação de moeda fica na célula.
 */
export function exportarConsultaExcel(params: ExportParams): void {
  const { resultado, titulo, rotuloEntidade } = params;

  const arvore = !!params.colunaNivel;
  const rotulosMes = resultado.colunas.map((c) => c.label);
  const cabecalho = [
    rotuloEntidade,
    ...(arvore ? [params.colunaNivel as string] : []),
    "Código",
    ...rotulosMes,
    "Total",
    "Média",
  ];
  const corpo = resultado.linhas.map((l) => [
    indentar(l) + l.descricao,
    ...(arvore ? [l.rotuloNivel ?? ""] : []),
    l.codigo ?? "",
    ...l.valores,
    l.total,
    l.media,
  ]);
  const rodape = [
    "Total geral",
    ...(arvore ? [""] : []),
    "",
    ...resultado.totais,
    resultado.total,
    resultado.media,
  ];

  // Duas linhas de contexto antes da tabela: sem elas a planilha exportada
  // não diz de que período/vendedor ela é.
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
  // A formatação de moeda começa depois das colunas de texto: descrição,
  // código e — na árvore — o nível.
  const primeiraColunaNumerica = arvore ? 3 : 2;
  for (let l = 0; l < totalLinhas; l++) {
    for (let c = primeiraColunaNumerica; c < cabecalho.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: primeiraLinhaDados + l, c });
      const celula = sheet[ref];
      if (celula && typeof celula.v === "number")
        celula.z = params.formato === "quantidade" ? "#,##0" : "#,##0.00";
    }
  }
  sheet["!cols"] = [
    { wch: 45 },
    ...(arvore ? [{ wch: 14 }] : []),
    { wch: 14 },
    ...rotulosMes.map(() => ({ wch: 13 })),
    { wch: 15 },
    { wch: 15 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Consulta");
  XLSX.writeFile(wb, nomeArquivo(params, "xlsx"));
}
