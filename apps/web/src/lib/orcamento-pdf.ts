import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Cliente, Empresa, Orcamento } from "@plataforma/contracts";
import { STATUS_ORCAMENTO_LABEL } from "@/components/crud/orcamento-status";

/**
 * Proposta comercial em PDF, gerada no próprio navegador (jsPDF) a partir de
 * um orçamento já salvo — só o registro salvo tem os itens com produto
 * (código/descrição/unidade) e o total consolidado pelo servidor.
 *
 * O cabeçalho traz o cadastro da empresa emitente (razão social, CNPJ, IE,
 * endereço, contato), lido em GET /empresas/ativa — rota liberada a qualquer
 * usuário autenticado justamente porque o vendedor não tem
 * `empresas.visualizar`.
 */

const MARGEM = 14;

const moeda = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const numero = (v: number | null | undefined) =>
  v != null ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—";
const dataBr = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

/** Junta partes de endereço/documento ignorando as vazias. */
const juntar = (partes: (string | null | undefined)[], separador = " · ") =>
  partes.map((p) => p?.trim()).filter((p): p is string => !!p).join(separador);

// Documento/CEP/telefone são guardados sem máscara (só dígitos) — no papel
// eles precisam sair formatados. Valor fora do tamanho esperado sai como veio.
const soDigitos = (v: string) => v.replace(/\D/g, "");
const formatarDocumento = (v: string | null | undefined) => {
  if (!v) return null;
  const d = soDigitos(v);
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return v;
};
const formatarCep = (v: string | null | undefined) => {
  if (!v) return null;
  const d = soDigitos(v);
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, "$1-$2") : v;
};
const formatarTelefone = (v: string | null | undefined) => {
  if (!v) return null;
  const d = soDigitos(v);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return v;
};

/** Caixa (mm) em que o logo é encaixado no cabeçalho, preservando a proporção. */
const LOGO_LARGURA = 40;
const LOGO_ALTURA = 18;

/**
 * Baixa o logo e devolve um PNG em data URL — jsPDF precisa dos bytes da
 * imagem, não da URL. O redesenho num canvas normaliza o formato: a tela de
 * Empresas aceita WEBP e SVG no upload, que o jsPDF não embute direto.
 * Falha silenciosa: sem logo o PDF sai só com o nome da empresa.
 */
async function carregarLogo(url: string): Promise<string | null> {
  let objectUrl: string | null = null;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    if (!blob.type.startsWith("image/")) return null;
    objectUrl = URL.createObjectURL(blob);

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Falha ao carregar o logo"));
      el.src = objectUrl as string;
    });

    // SVG sem width/height explícitos chega com dimensão 0 em alguns
    // navegadores; nesse caso rasteriza na proporção da caixa do cabeçalho.
    const escalaPx = 8; // px por mm — resolução suficiente pra impressão
    const largura = img.naturalWidth || LOGO_LARGURA * escalaPx;
    const altura = img.naturalHeight || LOGO_ALTURA * escalaPx;
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, largura, altura);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export interface OrcamentoPdfParams {
  orcamento: Orcamento;
  /** Cadastro completo do cliente (GET /clientes/:id) — endereço, contato, documento. */
  cliente?: Cliente | null;
  /** Cadastro da empresa emitente (GET /empresas/ativa) — cabeçalho do documento. */
  empresa?: Empresa | null;
  /** Nome fantasia da sessão, usado enquanto o cadastro da empresa não chega. */
  empresaNome?: string | null;
  /** URL absoluta do logo da empresa ativa (ver assetUrl). */
  empresaLogoUrl?: string | null;
}

/** Monta o PDF e dispara o download no navegador. */
export async function gerarOrcamentoPdf({
  orcamento,
  cliente,
  empresa,
  empresaNome,
  empresaLogoUrl,
}: OrcamentoPdfParams): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const larguraPagina = doc.internal.pageSize.getWidth();
  let y = MARGEM;

  // --- Cabeçalho: logo + cadastro da empresa à esquerda, identificação do
  // documento à direita.
  const logo = empresaLogoUrl ? await carregarLogo(empresaLogoUrl) : null;
  let alturaLogo = 0;
  if (logo) {
    // Mantém a proporção original dentro da caixa do cabeçalho.
    const props = doc.getImageProperties(logo);
    const escala = Math.min(LOGO_LARGURA / props.width, LOGO_ALTURA / props.height);
    alturaLogo = props.height * escala;
    doc.addImage(logo, "PNG", MARGEM, y, props.width * escala, alturaLogo);
  }

  doc.setFont("helvetica", "bold").setFontSize(16);
  doc.text("ORÇAMENTO", larguraPagina - MARGEM, y + 5, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(
    [
      `Nº ${orcamento.numero}`,
      `Emissão: ${dataBr(orcamento.createdAt)}`,
      `Status: ${STATUS_ORCAMENTO_LABEL[orcamento.status]}`,
    ].join("\n"),
    larguraPagina - MARGEM,
    y + 11,
    { align: "right" },
  );

  // Bloco da empresa: abaixo do logo, limitado à largura que sobra antes do
  // bloco da direita (Nº/emissão/status) pra não haver sobreposição.
  let yEmpresa = y + (logo ? alturaLogo + 5 : 5);
  const larguraEmpresa = larguraPagina - MARGEM * 2 - 50;
  const titulo = empresa?.nomeFantasia || empresaNome;
  if (titulo) {
    doc.setFont("helvetica", "bold").setFontSize(12);
    doc.text(titulo, MARGEM, yEmpresa);
    yEmpresa += 5;
  }
  const linhasEmpresa = empresa
    ? [
        juntar([
          empresa.razaoSocial,
          empresa.cnpj ? `CNPJ: ${formatarDocumento(empresa.cnpj)}` : null,
          empresa.inscricaoEstadual ? `IE: ${empresa.inscricaoEstadual}` : null,
          empresa.inscricaoMunicipal ? `IM: ${empresa.inscricaoMunicipal}` : null,
        ]),
        juntar([empresa.endereco, empresa.complemento, empresa.bairro]),
        juntar([empresa.municipio, empresa.uf, formatarCep(empresa.cep)]),
        juntar([formatarTelefone(empresa.telefone), empresa.email, empresa.site]),
      ].filter(Boolean)
    : [];
  if (linhasEmpresa.length) {
    doc.setFont("helvetica", "normal").setFontSize(8);
    const quebradas = linhasEmpresa.flatMap(
      (linha) => doc.splitTextToSize(linha, larguraEmpresa) as string[],
    );
    doc.text(quebradas, MARGEM, yEmpresa);
    yEmpresa += quebradas.length * 3.6;
  }

  // O cabeçalho acaba no que for mais baixo: o bloco da direita (3 linhas) ou
  // o bloco da empresa à esquerda.
  y = Math.max(y + 22, yEmpresa);
  doc.setDrawColor(200).line(MARGEM, y, larguraPagina - MARGEM, y);
  y += 6;

  // --- Cliente
  doc.setFont("helvetica", "bold").setFontSize(9);
  doc.text("CLIENTE", MARGEM, y);
  y += 4.5;
  doc.setFont("helvetica", "normal").setFontSize(9);
  const linhasCliente = [
    cliente?.razaoSocial ?? orcamento.cliente.razaoSocial,
    juntar([
      cliente?.nomeFantasia || orcamento.cliente.nomeFantasia,
      cliente?.cnpjCpf ? `CNPJ/CPF: ${formatarDocumento(cliente.cnpjCpf)}` : null,
      cliente?.inscricaoEstadual ? `IE: ${cliente.inscricaoEstadual}` : null,
    ]),
    juntar([cliente?.endereco, cliente?.complemento, cliente?.bairro]),
    juntar([cliente?.municipio, cliente?.uf, formatarCep(cliente?.cep)]),
    juntar([
      cliente?.contato ? `Contato: ${cliente.contato}` : null,
      formatarTelefone(cliente?.telefone),
      formatarTelefone(cliente?.celular),
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
    juntar([
      `Vendedor: ${orcamento.vendedor.nomeReduzido || orcamento.vendedor.nome}`,
      formatarTelefone(orcamento.vendedor.telefone),
      orcamento.vendedor.email,
    ]),
    `Condição de pagamento: ${orcamento.condicaoPagamento?.descricao ?? "—"}`,
    `Válido até: ${dataBr(orcamento.dataValidade)}    Data de retorno: ${dataBr(orcamento.dataRetorno)}`,
  ];
  doc.text(linhasCondicoes, MARGEM, y);
  y += linhasCondicoes.length * 4.2 + 4;

  // --- Itens (autoTable pagina sozinho quando passa da primeira folha)
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEM, right: MARGEM },
    // vlrUnitario já é o preço praticado (líquido) — o desconto sobre a tabela
    // de preço é só um derivado interno, que não vai pra proposta do cliente.
    head: [["Código", "Produto", "Un.", "Qtd.", "Preço unit.", "Total"]],
    body: orcamento.itens.map((i) => [
      i.produto.codigoErp,
      i.produto.descricao,
      i.produto.unidade ?? "—",
      numero(i.quantidade),
      moeda(i.vlrUnitario),
      moeda(i.vlrTotal),
    ]),
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
    columnStyles: {
      2: { halign: "center" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
  });
  // O autoTable grava onde a tabela terminou — daí seguimos com total/observação.
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // Só o autoTable pagina sozinho; o que vem depois dele precisa checar se
  // ainda cabe na folha (tabela terminando no rodapé é o caso comum).
  const alturaPagina = doc.internal.pageSize.getHeight();
  const garantirEspaco = (altura: number) => {
    if (y + altura > alturaPagina - MARGEM) {
      doc.addPage();
      y = MARGEM;
    }
  };

  // --- Total
  garantirEspaco(10);
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text(`Total: ${moeda(orcamento.vlrTotal)}`, larguraPagina - MARGEM, y, { align: "right" });
  y += 10;

  // --- Observação (só quando preenchida)
  if (orcamento.observacao?.trim()) {
    const linhas = doc.splitTextToSize(
      orcamento.observacao.trim(),
      larguraPagina - MARGEM * 2,
    ) as string[];
    garantirEspaco(4.5 + linhas.length * 4.2);
    doc.setFont("helvetica", "bold").setFontSize(9);
    doc.text("OBSERVAÇÃO", MARGEM, y);
    y += 4.5;
    doc.setFont("helvetica", "normal").setFontSize(9);
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

  doc.save(`orcamento-${orcamento.numero}.pdf`);
}
