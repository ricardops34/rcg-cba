import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Cliente, Orcamento } from "@plataforma/contracts";
import { STATUS_ORCAMENTO_LABEL } from "@/components/crud/orcamento-status";

/**
 * Proposta comercial em PDF, gerada no próprio navegador (jsPDF) a partir de
 * um orçamento já salvo — só o registro salvo tem os itens com produto
 * (código/descrição/unidade) e o total consolidado pelo servidor.
 *
 * O cabeçalho usa o logo/nome fantasia da empresa ativa que já estão na
 * sessão (CurrentUser.empresas): buscar razão social/CNPJ exigiria
 * `empresas.visualizar`, permissão de admin que o vendedor não tem.
 */

const MARGEM = 14;

const moeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const numero = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—";
const percentual = (v: number | null | undefined) =>
  v != null ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : "—";
const dataBr = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

/** Junta partes de endereço/documento ignorando as vazias. */
const juntar = (partes: (string | null | undefined)[], separador = " · ") =>
  partes.map((p) => p?.trim()).filter((p): p is string => !!p).join(separador);

/**
 * Baixa o logo e converte pra data URL — jsPDF precisa dos bytes da imagem,
 * não da URL. Falha silenciosa: sem logo o PDF sai só com o nome da empresa.
 */
async function carregarLogo(url: string): Promise<{ dataUrl: string; formato: string } | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const formato = blob.type === "image/jpeg" ? "JPEG" : blob.type === "image/png" ? "PNG" : null;
    if (!formato) return null;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Falha ao ler o logo"));
      reader.readAsDataURL(blob);
    });
    return { dataUrl, formato };
  } catch {
    return null;
  }
}

export interface OrcamentoPdfParams {
  orcamento: Orcamento;
  /** Cadastro completo do cliente (GET /clientes/:id) — endereço, contato, documento. */
  cliente?: Cliente | null;
  empresaNome?: string | null;
  /** URL absoluta do logo da empresa ativa (ver assetUrl). */
  empresaLogoUrl?: string | null;
}

/** Monta o PDF e dispara o download no navegador. */
export async function gerarOrcamentoPdf({
  orcamento,
  cliente,
  empresaNome,
  empresaLogoUrl,
}: OrcamentoPdfParams): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const larguraPagina = doc.internal.pageSize.getWidth();
  let y = MARGEM;

  // --- Cabeçalho: logo + empresa à esquerda, identificação do documento à direita
  const logo = empresaLogoUrl ? await carregarLogo(empresaLogoUrl) : null;
  if (logo) {
    // Mantém a proporção original dentro de uma caixa de 32x16mm.
    const props = doc.getImageProperties(logo.dataUrl);
    const escala = Math.min(32 / props.width, 16 / props.height);
    doc.addImage(logo.dataUrl, logo.formato, MARGEM, y, props.width * escala, props.height * escala);
  }
  if (empresaNome) {
    doc.setFont("helvetica", "bold").setFontSize(12);
    doc.text(empresaNome, MARGEM, y + (logo ? 21 : 5));
  }

  doc.setFont("helvetica", "bold").setFontSize(16);
  doc.text("ORÇAMENTO", larguraPagina - MARGEM, y + 5, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(
    [
      orcamento.codigoLegado != null ? `Nº ${orcamento.codigoLegado}` : "",
      `Emissão: ${dataBr(orcamento.createdAt)}`,
      `Status: ${STATUS_ORCAMENTO_LABEL[orcamento.status]}`,
    ]
      .filter(Boolean)
      .join("\n"),
    larguraPagina - MARGEM,
    y + 11,
    { align: "right" },
  );

  y += logo ? 26 : 20;
  doc.setDrawColor(200).line(MARGEM, y, larguraPagina - MARGEM, y);
  y += 6;

  // --- Título do orçamento
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text(orcamento.titulo, MARGEM, y);
  y += 7;

  // --- Cliente
  doc.setFont("helvetica", "bold").setFontSize(9);
  doc.text("CLIENTE", MARGEM, y);
  y += 4.5;
  doc.setFont("helvetica", "normal").setFontSize(9);
  const linhasCliente = [
    cliente?.razaoSocial ?? orcamento.cliente.razaoSocial,
    juntar([
      cliente?.nomeFantasia || orcamento.cliente.nomeFantasia,
      cliente?.cnpjCpf ? `CNPJ/CPF: ${cliente.cnpjCpf}` : null,
    ]),
    juntar([cliente?.endereco, cliente?.complemento, cliente?.bairro]),
    juntar([cliente?.municipio, cliente?.uf, cliente?.cep]),
    juntar([
      cliente?.contato ? `Contato: ${cliente.contato}` : null,
      cliente?.telefone,
      cliente?.celular,
      cliente?.email,
    ]),
  ].filter(Boolean);
  doc.text(linhasCliente, MARGEM, y);
  y += linhasCliente.length * 4.2 + 4;

  // --- Condições comerciais (vendedor, pagamento, prazos)
  doc.setFont("helvetica", "bold").setFontSize(9);
  doc.text("CONDIÇÕES", MARGEM, y);
  y += 4.5;
  doc.setFont("helvetica", "normal").setFontSize(9);
  const linhasCondicoes = [
    `Vendedor: ${orcamento.vendedor.nomeReduzido || orcamento.vendedor.nome}`,
    `Condição de pagamento: ${orcamento.condicaoPagamento?.descricao ?? "—"}`,
    `Válido até: ${dataBr(orcamento.dataValidade)}    Data de retorno: ${dataBr(orcamento.dataRetorno)}`,
  ];
  doc.text(linhasCondicoes, MARGEM, y);
  y += linhasCondicoes.length * 4.2 + 4;

  // --- Itens (autoTable pagina sozinho quando passa da primeira folha)
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEM, right: MARGEM },
    head: [["Código", "Produto", "Un.", "Qtd.", "Preço", "Desc.", "Total"]],
    body: orcamento.itens.map((i) => [
      i.produto.codigoErp,
      i.produto.descricao,
      i.produto.unidade ?? "—",
      numero(i.quantidade),
      moeda(i.vlrUnitario),
      percentual(i.percDesconto),
      moeda(i.vlrTotal),
    ]),
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
    columnStyles: {
      2: { halign: "center" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
  });
  // O autoTable grava onde a tabela terminou — daí seguimos com total/observação.
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // --- Total
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text(`Total: ${moeda(orcamento.vlrTotal)}`, larguraPagina - MARGEM, y, { align: "right" });
  y += 10;

  // --- Observação
  if (orcamento.observacao?.trim()) {
    doc.setFont("helvetica", "bold").setFontSize(9);
    doc.text("OBSERVAÇÃO", MARGEM, y);
    y += 4.5;
    doc.setFont("helvetica", "normal").setFontSize(9);
    const linhas = doc.splitTextToSize(orcamento.observacao, larguraPagina - MARGEM * 2) as string[];
    doc.text(linhas, MARGEM, y);
  }

  // --- Rodapé com paginação, em todas as folhas
  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(130);
    doc.text(
      `Página ${p} de ${totalPaginas}`,
      larguraPagina - MARGEM,
      doc.internal.pageSize.getHeight() - 8,
      { align: "right" },
    );
    doc.setTextColor(0);
  }

  const nome = orcamento.codigoLegado != null ? `orcamento-${orcamento.codigoLegado}` : "orcamento";
  doc.save(`${nome}.pdf`);
}
