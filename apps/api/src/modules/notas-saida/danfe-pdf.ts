import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  code128cModulos,
  desenharBarras,
  larguraBarras,
} from '../../common/pdf/barcode';
import type { NfeDados } from './nfe-xml';

/**
 * DANFE — a representação impressa da NF-e, montada a partir do **XML
 * autorizado** que o ERP empurrou (ver `docs/planos/segunda-via-danfe-boleto.md`).
 *
 * Duas coisas que este arquivo não faz, de propósito:
 *
 * - **Não emite nota.** Ele imprime o que a SEFAZ já autorizou. Se o XML não
 *   trouxer protocolo, o documento sai carimbado como sem autorização, e não
 *   silenciosamente parecido com um DANFE válido.
 * - **Não recalcula imposto.** Todo número impresso vem do XML. Divergir do
 *   arquivo que foi transmitido seria produzir um papel que não corresponde à
 *   nota — e o papel é justamente o que o cliente e o fiscal olham.
 *
 * O layout segue o modelo retrato do Manual de Integração (canhoto, quadros de
 * emitente/destinatário, fatura, impostos, transporte, itens e dados
 * adicionais). Não é a validação oficial de layout, que exige homologação —
 * é a 2ª via que o cliente pediu no WhatsApp.
 */

const MARGEM = 8;
const LARGURA_PAGINA = 210;
const LARGURA_UTIL = LARGURA_PAGINA - MARGEM * 2;

const moeda = (v: number | null | undefined) =>
  v == null
    ? ''
    : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const quantidade = (v: number | null | undefined) =>
  v == null ? '' : v.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

const dataBr = (v: string | null | undefined) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('pt-BR');
};

const documento = (v: string | null | undefined) => {
  const d = (v ?? '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return v ?? '';
};

const cep = (v: string | null | undefined) => {
  const d = (v ?? '').replace(/\D/g, '');
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : (v ?? '');
};

/** A chave sai impressa em blocos de quatro — é assim que se confere no portal. */
const chaveFormatada = (chave: string) => chave.replace(/(\d{4})(?=\d)/g, '$1 ');

const MODALIDADE_FRETE: Record<string, string> = {
  '0': '0-EMITENTE',
  '1': '1-DEST/REM',
  '2': '2-TERCEIROS',
  '3': '3-PRÓPRIO/REM',
  '4': '4-PRÓPRIO/DEST',
  '9': '9-SEM FRETE',
};

/**
 * Campo do formulário: moldura, rótulo miúdo e valor.
 *
 * `valor` é cortado na largura da caixa em vez de quebrar linha: no DANFE cada
 * quadro tem altura fixa, e texto transbordando invadiria o quadro vizinho.
 */
function campo(
  doc: jsPDF,
  x: number,
  y: number,
  largura: number,
  altura: number,
  rotulo: string,
  valor: string,
  opcoes: { alinhamento?: 'left' | 'center' | 'right'; tamanho?: number; negrito?: boolean } = {},
) {
  doc.setLineWidth(0.1);
  doc.rect(x, y, largura, altura);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.6);
  doc.text(rotulo.toUpperCase(), x + 1, y + 2.2);

  doc.setFont('helvetica', opcoes.negrito ? 'bold' : 'normal');
  doc.setFontSize(opcoes.tamanho ?? 7);
  const texto = doc.splitTextToSize(valor || '', largura - 2)[0] ?? '';
  const alinhamento = opcoes.alinhamento ?? 'left';
  const posX =
    alinhamento === 'right'
      ? x + largura - 1
      : alinhamento === 'center'
        ? x + largura / 2
        : x + 1;
  doc.text(texto, posX, y + altura - 1.5, { align: alinhamento });
}

/** Bloco de texto com moldura, para endereço e observações (quebra linha). */
function campoMultilinha(
  doc: jsPDF,
  x: number,
  y: number,
  largura: number,
  altura: number,
  rotulo: string,
  valor: string,
) {
  doc.setLineWidth(0.1);
  doc.rect(x, y, largura, altura);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.6);
  doc.text(rotulo.toUpperCase(), x + 1, y + 2.2);

  doc.setFontSize(6);
  const linhas = doc.splitTextToSize(valor || '', largura - 2) as string[];
  const cabem = Math.max(0, Math.floor((altura - 3.5) / 2.6));
  doc.text(linhas.slice(0, cabem), x + 1, y + 5);
}

/** Título de seção ("DADOS DO PRODUTO/SERVIÇO"), na régua do formulário. */
function secao(doc: jsPDF, y: number, titulo: string) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.text(titulo.toUpperCase(), MARGEM, y);
}

function enderecoLinha(parte: NfeDados['emitente']) {
  const e = parte.endereco;
  return [
    [e.logradouro, e.numero].filter(Boolean).join(', '),
    e.complemento,
    e.bairro,
  ]
    .filter(Boolean)
    .join(' - ');
}

/**
 * Marca d'água diagonal para nota que não vale como documento fiscal.
 *
 * Existe porque a 2ª via circula por WhatsApp: sem o carimbo, o PDF de uma
 * nota cancelada é visualmente igual ao de uma nota válida.
 */
function carimbo(doc: jsPDF, texto: string) {
  doc.saveGraphicsState();
  doc.setTextColor(190, 190, 190);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(46);
  doc.text(texto, LARGURA_PAGINA / 2, 150, { align: 'center', angle: 32 });
  doc.setTextColor(0, 0, 0);
  doc.restoreGraphicsState();
}

export type DanfePdfOpcoes = {
  /** Marca o papel como reimpressão — é sempre 2ª via quando sai daqui. */
  segundaVia?: boolean;
};

/** Monta o DANFE e devolve os bytes do PDF. */
export function montarDanfePdf(nfe: NfeDados, opcoes: DanfePdfOpcoes = {}): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGEM;

  // ------------------------------------------------------------------
  // Canhoto: recibo de entrega destacável.
  // ------------------------------------------------------------------
  const alturaCanhoto = 12;
  doc.setLineWidth(0.1);
  doc.rect(MARGEM, y, LARGURA_UTIL - 26, alturaCanhoto);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.text(
    `RECEBEMOS DE ${nfe.emitente.nome ?? ''} OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO`,
    MARGEM + 1,
    y + 3,
  );
  doc.line(MARGEM, y + 5, MARGEM + LARGURA_UTIL - 26, y + 5);
  doc.setFontSize(4.6);
  doc.text('DATA DE RECEBIMENTO', MARGEM + 1, y + 7.5);
  doc.text('IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR', MARGEM + 41, y + 7.5);
  doc.line(MARGEM + 40, y + 5, MARGEM + 40, y + alturaCanhoto);

  // Identificação da nota, ao lado do canhoto.
  doc.rect(MARGEM + LARGURA_UTIL - 26, y, 26, alturaCanhoto);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('NF-e', MARGEM + LARGURA_UTIL - 13, y + 4, { align: 'center' });
  doc.setFontSize(7);
  doc.text(
    `Nº ${nfe.numero ?? ''}`,
    MARGEM + LARGURA_UTIL - 13,
    y + 7.5,
    { align: 'center' },
  );
  doc.text(`SÉRIE ${nfe.serie ?? ''}`, MARGEM + LARGURA_UTIL - 13, y + 10.5, {
    align: 'center',
  });

  y += alturaCanhoto + 3;
  // Linha de corte.
  doc.setLineDashPattern([1, 1], 0);
  doc.line(MARGEM, y - 1.5, MARGEM + LARGURA_UTIL, y - 1.5);
  doc.setLineDashPattern([], 0);

  // ------------------------------------------------------------------
  // Cabeçalho: emitente | DANFE | chave de acesso.
  // ------------------------------------------------------------------
  const alturaCabecalho = 30;
  const larguraEmitente = 78;
  const larguraDanfe = 30;
  const larguraChave = LARGURA_UTIL - larguraEmitente - larguraDanfe;

  doc.rect(MARGEM, y, larguraEmitente, alturaCabecalho);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(
    doc.splitTextToSize(nfe.emitente.nome ?? '', larguraEmitente - 4) as string[],
    MARGEM + larguraEmitente / 2,
    y + 5,
    { align: 'center' },
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  const enderecoEmitente = [
    enderecoLinha(nfe.emitente),
    [nfe.emitente.endereco.municipio, nfe.emitente.endereco.uf]
      .filter(Boolean)
      .join(' - '),
    `CEP: ${cep(nfe.emitente.endereco.cep)}`,
    nfe.emitente.endereco.telefone ? `Fone: ${nfe.emitente.endereco.telefone}` : '',
  ].filter(Boolean);
  doc.text(enderecoEmitente, MARGEM + larguraEmitente / 2, y + 13, {
    align: 'center',
  });

  // Quadro DANFE.
  const xDanfe = MARGEM + larguraEmitente;
  doc.rect(xDanfe, y, larguraDanfe, alturaCabecalho);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DANFE', xDanfe + larguraDanfe / 2, y + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.8);
  doc.text('DOCUMENTO AUXILIAR DA', xDanfe + larguraDanfe / 2, y + 8, {
    align: 'center',
  });
  doc.text('NOTA FISCAL ELETRÔNICA', xDanfe + larguraDanfe / 2, y + 10.5, {
    align: 'center',
  });

  // Entrada/saída: 0 = entrada, 1 = saída (tpNF do XML).
  const saida = nfe.tipoOperacao !== '0';
  doc.setFontSize(5);
  doc.text('0 - ENTRADA', xDanfe + 2, y + 15);
  doc.text('1 - SAÍDA', xDanfe + 2, y + 18);
  doc.rect(xDanfe + larguraDanfe - 8, y + 12.5, 6, 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(saida ? '1' : '0', xDanfe + larguraDanfe - 5, y + 17, {
    align: 'center',
  });

  doc.setFontSize(7);
  doc.text(`Nº ${nfe.numero ?? ''}`, xDanfe + larguraDanfe / 2, y + 23, {
    align: 'center',
  });
  doc.text(`SÉRIE ${nfe.serie ?? ''}`, xDanfe + larguraDanfe / 2, y + 27, {
    align: 'center',
  });

  // Chave de acesso: código de barras Code128C + a chave em dígitos.
  const xChave = xDanfe + larguraDanfe;
  doc.rect(xChave, y, larguraChave, alturaCabecalho);
  const modulos = code128cModulos(nfe.chave);
  // Encaixa a chave na largura disponível: 44 dígitos em Code128C dão 25
  // símbolos, e um X fixo estouraria o quadro em papel A4.
  const larguraModulo = Math.min(
    0.33,
    (larguraChave - 6) / (larguraBarras(modulos, 1) || 1),
  );
  const larguraCodigo = larguraBarras(modulos, larguraModulo);
  desenharBarras(doc, modulos, {
    x: xChave + (larguraChave - larguraCodigo) / 2,
    y: y + 3,
    altura: 12,
    larguraModulo,
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.6);
  doc.text('CHAVE DE ACESSO', xChave + 1, y + 18.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.text(chaveFormatada(nfe.chave), xChave + larguraChave / 2, y + 22, {
    align: 'center',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.text(
    'Consulta de autenticidade no portal nacional da NF-e (www.nfe.fazenda.gov.br/portal) ou no site da Sefaz autorizadora',
    xChave + larguraChave / 2,
    y + 26,
    { align: 'center', maxWidth: larguraChave - 3 },
  );

  y += alturaCabecalho;

  // Protocolo de autorização.
  campo(
    doc,
    MARGEM,
    y,
    LARGURA_UTIL,
    7,
    'Protocolo de autorização de uso',
    nfe.protocolo
      ? `${nfe.protocolo} — ${dataBr(nfe.dataProtocolo)}`
      : 'NOTA SEM PROTOCOLO DE AUTORIZAÇÃO NO ARQUIVO XML',
    { alinhamento: 'center', negrito: true },
  );
  y += 7;

  campo(doc, MARGEM, y, LARGURA_UTIL, 7, 'Natureza da operação', nfe.naturezaOperacao ?? '');
  y += 7;

  const t3 = LARGURA_UTIL / 3;
  campo(doc, MARGEM, y, t3, 7, 'CNPJ', documento(nfe.emitente.documento));
  campo(doc, MARGEM + t3, y, t3, 7, 'Inscrição estadual', nfe.emitente.inscricaoEstadual ?? '');
  campo(
    doc,
    MARGEM + t3 * 2,
    y,
    LARGURA_UTIL - t3 * 2,
    7,
    'Data de emissão',
    dataBr(nfe.dataEmissao),
  );
  y += 9;

  // ------------------------------------------------------------------
  // Destinatário / remetente.
  // ------------------------------------------------------------------
  secao(doc, y, 'Destinatário / Remetente');
  y += 1.5;
  campo(doc, MARGEM, y, LARGURA_UTIL - 42 - 26, 7, 'Nome / razão social', nfe.destinatario.nome ?? '');
  campo(doc, MARGEM + LARGURA_UTIL - 68, y, 42, 7, 'CNPJ / CPF', documento(nfe.destinatario.documento));
  campo(doc, MARGEM + LARGURA_UTIL - 26, y, 26, 7, 'Data de saída', dataBr(nfe.dataSaida));
  y += 7;

  campo(doc, MARGEM, y, LARGURA_UTIL - 60, 7, 'Endereço', enderecoLinha(nfe.destinatario));
  campo(doc, MARGEM + LARGURA_UTIL - 60, y, 34, 7, 'Município', nfe.destinatario.endereco.municipio ?? '');
  campo(doc, MARGEM + LARGURA_UTIL - 26, y, 10, 7, 'UF', nfe.destinatario.endereco.uf ?? '');
  campo(doc, MARGEM + LARGURA_UTIL - 16, y, 16, 7, 'CEP', cep(nfe.destinatario.endereco.cep));
  y += 7;

  campo(doc, MARGEM, y, LARGURA_UTIL - 60, 7, 'Bairro', nfe.destinatario.endereco.bairro ?? '');
  campo(doc, MARGEM + LARGURA_UTIL - 60, y, 34, 7, 'Inscrição estadual', nfe.destinatario.inscricaoEstadual ?? '');
  campo(doc, MARGEM + LARGURA_UTIL - 26, y, 26, 7, 'Telefone', nfe.destinatario.endereco.telefone ?? '');
  y += 9;

  // ------------------------------------------------------------------
  // Fatura / duplicatas.
  // ------------------------------------------------------------------
  if (nfe.duplicatas.length > 0) {
    secao(doc, y, 'Fatura / Duplicatas');
    y += 1.5;
    const porLinha = 4;
    const largura = LARGURA_UTIL / porLinha;
    nfe.duplicatas.slice(0, 12).forEach((dup, i) => {
      const linha = Math.floor(i / porLinha);
      const coluna = i % porLinha;
      campo(
        doc,
        MARGEM + coluna * largura,
        y + linha * 7,
        largura,
        7,
        `Parcela ${dup.numero ?? i + 1} — venc. ${dataBr(dup.vencimento)}`,
        moeda(dup.valor),
        { alinhamento: 'right' },
      );
    });
    y += Math.ceil(Math.min(nfe.duplicatas.length, 12) / porLinha) * 7 + 2;
  }

  // ------------------------------------------------------------------
  // Cálculo do imposto.
  // ------------------------------------------------------------------
  secao(doc, y, 'Cálculo do imposto');
  y += 1.5;
  const c5 = LARGURA_UTIL / 5;
  campo(doc, MARGEM, y, c5, 7, 'Base de cálculo do ICMS', moeda(nfe.totais.baseIcms), { alinhamento: 'right' });
  campo(doc, MARGEM + c5, y, c5, 7, 'Valor do ICMS', moeda(nfe.totais.valorIcms), { alinhamento: 'right' });
  campo(doc, MARGEM + c5 * 2, y, c5, 7, 'Base de cálculo ICMS ST', moeda(nfe.totais.baseIcmsSt), { alinhamento: 'right' });
  campo(doc, MARGEM + c5 * 3, y, c5, 7, 'Valor do ICMS ST', moeda(nfe.totais.valorIcmsSt), { alinhamento: 'right' });
  campo(doc, MARGEM + c5 * 4, y, c5, 7, 'Valor total dos produtos', moeda(nfe.totais.valorProdutos), { alinhamento: 'right' });
  y += 7;
  campo(doc, MARGEM, y, c5, 7, 'Valor do frete', moeda(nfe.totais.valorFrete), { alinhamento: 'right' });
  campo(doc, MARGEM + c5, y, c5, 7, 'Valor do seguro', moeda(nfe.totais.valorSeguro), { alinhamento: 'right' });
  campo(doc, MARGEM + c5 * 2, y, c5, 7, 'Desconto', moeda(nfe.totais.valorDesconto), { alinhamento: 'right' });
  campo(doc, MARGEM + c5 * 3, y, c5, 7, 'Valor do IPI', moeda(nfe.totais.valorIpi), { alinhamento: 'right' });
  campo(doc, MARGEM + c5 * 4, y, c5, 7, 'Valor total da nota', moeda(nfe.totais.valorTotal), {
    alinhamento: 'right',
    negrito: true,
    tamanho: 8,
  });
  y += 9;

  // ------------------------------------------------------------------
  // Transportador / volumes.
  // ------------------------------------------------------------------
  secao(doc, y, 'Transportador / Volumes transportados');
  y += 1.5;
  campo(doc, MARGEM, y, LARGURA_UTIL - 76, 7, 'Nome / razão social', nfe.transporte.transportador ?? '');
  campo(doc, MARGEM + LARGURA_UTIL - 76, y, 30, 7, 'Frete por conta', MODALIDADE_FRETE[nfe.transporte.modalidadeFrete ?? ''] ?? '');
  campo(doc, MARGEM + LARGURA_UTIL - 46, y, 20, 7, 'Placa', nfe.transporte.placa ?? '');
  campo(doc, MARGEM + LARGURA_UTIL - 26, y, 26, 7, 'CNPJ / CPF', documento(nfe.transporte.documentoTransportador));
  y += 7;
  const c4 = LARGURA_UTIL / 4;
  campo(doc, MARGEM, y, c4, 7, 'Quantidade', quantidade(nfe.transporte.quantidade));
  campo(doc, MARGEM + c4, y, c4, 7, 'Espécie', nfe.transporte.especie ?? '');
  campo(doc, MARGEM + c4 * 2, y, c4, 7, 'Peso bruto', quantidade(nfe.transporte.pesoBruto), { alinhamento: 'right' });
  campo(doc, MARGEM + c4 * 3, y, c4, 7, 'Peso líquido', quantidade(nfe.transporte.pesoLiquido), { alinhamento: 'right' });
  y += 9;

  // ------------------------------------------------------------------
  // Itens.
  // ------------------------------------------------------------------
  secao(doc, y, 'Dados do produto / serviço');
  y += 2;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGEM, right: MARGEM },
    theme: 'grid',
    styles: { fontSize: 5.6, cellPadding: 0.8, lineWidth: 0.1, textColor: 0 },
    headStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: 'bold' },
    head: [
      [
        'Cód.',
        'Descrição',
        'NCM',
        'CST',
        'CFOP',
        'Un.',
        'Qtd.',
        'Vl. unit.',
        'Vl. total',
        'BC ICMS',
        'Vl. ICMS',
        'Vl. IPI',
        'Alíq. ICMS',
        'Alíq. IPI',
      ],
    ],
    body: nfe.itens.map((item) => [
      item.codigo ?? '',
      item.descricao ?? '',
      item.ncm ?? '',
      item.cst ?? '',
      item.cfop ?? '',
      item.unidade ?? '',
      quantidade(item.quantidade),
      moeda(item.valorUnitario),
      moeda(item.valorTotal),
      moeda(item.baseIcms),
      moeda(item.valorIcms),
      moeda(item.valorIpi),
      item.aliquotaIcms != null ? `${moeda(item.aliquotaIcms)}%` : '',
      item.aliquotaIpi != null ? `${moeda(item.aliquotaIpi)}%` : '',
    ]),
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 11 },
      3: { cellWidth: 8 },
      4: { cellWidth: 8 },
      5: { cellWidth: 6 },
      6: { cellWidth: 13, halign: 'right' },
      7: { cellWidth: 14, halign: 'right' },
      8: { cellWidth: 15, halign: 'right' },
      9: { cellWidth: 14, halign: 'right' },
      10: { cellWidth: 13, halign: 'right' },
      11: { cellWidth: 12, halign: 'right' },
      12: { cellWidth: 11, halign: 'right' },
      13: { cellWidth: 10, halign: 'right' },
    },
  });

  // jspdf-autotable guarda a última posição em `lastAutoTable`.
  const depoisDaTabela =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y = depoisDaTabela + 3;

  // ------------------------------------------------------------------
  // Dados adicionais.
  // ------------------------------------------------------------------
  const alturaObs = 20;
  if (y + alturaObs > 290) {
    doc.addPage();
    y = MARGEM;
  }
  secao(doc, y, 'Dados adicionais');
  y += 1.5;
  campoMultilinha(
    doc,
    MARGEM,
    y,
    LARGURA_UTIL,
    alturaObs,
    'Informações complementares',
    [
      nfe.informacoesComplementares ?? '',
      opcoes.segundaVia ? 'DOCUMENTO REIMPRESSO (2ª VIA).' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );

  // Carimbos vão por último, em todas as páginas, para ficarem por cima.
  const marca = nfe.cancelada
    ? 'NF-e CANCELADA'
    : !nfe.protocolo
      ? 'SEM VALOR FISCAL'
      : null;
  if (marca) {
    const paginas = doc.getNumberOfPages();
    for (let p = 1; p <= paginas; p++) {
      doc.setPage(p);
      carimbo(doc, marca);
    }
  }

  return Buffer.from(doc.output('arraybuffer'));
}
