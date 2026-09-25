import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { jsPDF } from 'jspdf';
import {
  desenharBarras,
  itfModulos,
} from '../../common/pdf/barcode';
import { montarBoleto, type BoletoEntrada } from './boleto-codigo';

/**
 * Layout da Ficha de Compensação (boleto) em PDF — 3 vias no padrão ERP:
 * 1. VIA EMPRESA (Topo)
 * 2. VIA PAGADOR (Meio)
 * 3. FICHA DE COMPENSAÇÃO (Base com código de barras)
 */

const MARGEM = 10;
const LARGURA = 190;

function formatarCodigoBanco(codigo: string): string {
  const num = (codigo ?? '').replace(/\D/g, '');
  if (num === '237') return '237-2';
  if (num === '001') return '001-9';
  if (num === '104') return '104-0';
  if (num === '341') return '341-7';
  if (num === '033') return '033-7';
  return codigo.includes('-') ? codigo : `${codigo}-9`;
}

async function carregarBancoLogo(
  logoUrl: string,
): Promise<{ dados: string; formato: 'PNG' | 'JPEG' } | null> {
  try {
    const arquivo = basename(logoUrl);
    if (!arquivo || arquivo.startsWith('.')) return null;

    const extensao = arquivo.slice(arquivo.lastIndexOf('.')).toLowerCase();
    const formato =
      extensao === '.png'
        ? 'PNG'
        : extensao === '.jpg' || extensao === '.jpeg'
          ? 'JPEG'
          : null;
    if (!formato) return null;

    const caminho = join(
      process.cwd(),
      logoUrl.startsWith('/') ? logoUrl.slice(1) : logoUrl,
    );
    if (!existsSync(caminho)) return null;

    const conteudo = await readFile(caminho);
    const mime = formato === 'PNG' ? 'image/png' : 'image/jpeg';
    return {
      dados: `data:${mime};base64,${conteudo.toString('base64')}`,
      formato,
    };
  } catch {
    return null;
  }
}

const moeda = (v: number | null | undefined) =>
  v == null
    ? ''
    : v.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const dataBr = (v: Date | string | null | undefined) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
};

const documento = (v: string | null | undefined) => {
  const d = (v ?? '').replace(/\D/g, '');
  if (d.length === 14)
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11)
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return v ?? '';
};

export type BoletoPdfDados = {
  banco: { codigo: string; nome: string; logoUrl?: string | null };
  beneficiario: {
    nome: string;
    documento: string | null;
    endereco: string | null;
    agenciaConta: string;
  };
  pagador: {
    nome: string;
    documento: string | null;
    endereco: string | null;
  };
  titulo: {
    numeroDocumento: string;
    vencimento: Date | null;
    emissao: Date | null;
    valor: number;
    carteira: string;
    especieDocumento: string;
    aceite: string;
    impressoPor?: string | null;
  };
  localPagamento: string;
  instrucoes: string[];
  demonstrativo: string | null;
  codigo: BoletoEntrada;
  marcaDagua?: string | null;
};

/** Marca d'água na diagonal (ex.: "TÍTULO BAIXADO"). */
function desenharMarcaDagua(doc: jsPDF, texto: string) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(38);
  doc.setTextColor(220, 38, 38);
  doc.text(texto.toUpperCase(), 105, 148, {
    align: 'center',
    angle: 45,
  });
  doc.setTextColor(0, 0, 0);
}

/** Desenha a logo do banco ou o nome textual no box do cabeçalho. */
function desenharLogoOuNome(
  doc: jsPDF,
  x: number,
  y: number,
  dados: BoletoPdfDados,
  logoImage?: { dados: string; formato: 'PNG' | 'JPEG' } | null,
) {
  if (logoImage) {
    try {
      const props = doc.getImageProperties(logoImage.dados);
      const maxW = 38;
      const maxH = 7;
      const escala = Math.min(maxW / props.width, maxH / props.height);
      const w = props.width * escala;
      const h = props.height * escala;
      const yPos = y + (8 - h) / 2;
      doc.addImage(logoImage.dados, logoImage.formato, x + 1, yPos, w, h);
    } catch {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(dados.banco.nome, x + 1, y + 6);
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(dados.banco.nome, x + 1, y + 6);
  }
}

/** Campo da ficha: rótulo miúdo em cima, valor embaixo, linha inferior. */
function campo(
  doc: jsPDF,
  x: number,
  y: number,
  largura: number,
  rotulo: string,
  valor: string,
  opcoes: { alinhamento?: 'left' | 'right'; negrito?: boolean; tamanho?: number; altura?: number } = {},
) {
  const altura = opcoes.altura ?? 8;
  doc.setLineWidth(0.1);
  doc.line(x, y + altura, x + largura, y + altura);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.8);
  doc.text(rotulo.toUpperCase(), x + 1, y + 2.5);

  doc.setFont('helvetica', opcoes.negrito ? 'bold' : 'normal');
  doc.setFontSize(opcoes.tamanho ?? 7.5);
  const texto = (doc.splitTextToSize(valor || '', largura - 2) as string[])[0] ?? '';
  const alinhamento = opcoes.alinhamento ?? 'left';
  doc.text(texto, alinhamento === 'right' ? x + largura - 1 : x + 1, y + 6.8, {
    align: alinhamento,
  });
}

/** Divisor vertical entre campos. */
function divisor(doc: jsPDF, x: number, y: number, altura = 8) {
  doc.setLineWidth(0.1);
  doc.line(x, y, x, y + altura);
}

/** Linha pontilhada de corte. */
function linhaPontilhada(doc: jsPDF, y: number) {
  doc.setLineDashPattern([1.2, 1.2], 0);
  doc.line(MARGEM, y, MARGEM + LARGURA, y);
  doc.setLineDashPattern([], 0);
}

/** Cabeçalho para VIA EMPRESA e VIA PAGADOR. */
function cabecalhoVia(
  doc: jsPDF,
  y: number,
  tituloVia: 'VIA EMPRESA' | 'VIA PAGADOR',
  dados: BoletoPdfDados,
  logoImage?: { dados: string; formato: 'PNG' | 'JPEG' } | null,
) {
  desenharLogoOuNome(doc, MARGEM, y, dados, logoImage);
  divisor(doc, MARGEM + 45, y, 8);
  divisor(doc, MARGEM + LARGURA - 45, y, 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(tituloVia, MARGEM + LARGURA - 1, y + 5.5, { align: 'right' });

  doc.setLineWidth(0.4);
  doc.line(MARGEM, y + 8, MARGEM + LARGURA, y + 8);
  doc.setLineWidth(0.1);
}

/** Cabeçalho para a FICHA DE COMPENSAÇÃO (Logo + 237-2 + Linha Digitável). */
function cabecalhoFichaCompensacao(
  doc: jsPDF,
  y: number,
  dados: BoletoPdfDados,
  linhaDigitavel: string,
  logoImage?: { dados: string; formato: 'PNG' | 'JPEG' } | null,
) {
  desenharLogoOuNome(doc, MARGEM, y, dados, logoImage);
  divisor(doc, MARGEM + 45, y, 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(formatarCodigoBanco(dados.banco.codigo), MARGEM + 47, y + 6);
  divisor(doc, MARGEM + 68, y, 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(linhaDigitavel, MARGEM + LARGURA, y + 6, { align: 'right' });

  doc.setLineWidth(0.4);
  doc.line(MARGEM, y + 8, MARGEM + LARGURA, y + 8);
  doc.setLineWidth(0.1);
}

export async function montarBoletoPdf(dados: BoletoPdfDados): Promise<{
  conteudo: Buffer;
  linhaDigitavel: string;
  linhaDigitavelFormatada: string;
  codigoBarras: string;
  nossoNumeroFormatado: string;
}> {
  const logoImage = dados.banco.logoUrl
    ? await carregarBancoLogo(dados.banco.logoUrl)
    : null;
  const calculado = montarBoleto(dados.codigo);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // ------------------------------------------------------------------
  // 1. VIA EMPRESA (Topo)
  // ------------------------------------------------------------------
  let y = 10;
  cabecalhoVia(doc, y, 'VIA EMPRESA', dados, logoImage);
  y += 8;

  // Row 1
  campo(doc, MARGEM, y, 115, 'Beneficiário', dados.beneficiario.nome);
  divisor(doc, MARGEM + 115, y);
  campo(doc, MARGEM + 115, y, 40, 'CNPJ', documento(dados.beneficiario.documento));
  divisor(doc, MARGEM + 155, y);
  campo(doc, MARGEM + 155, y, 35, 'Vencimento', dataBr(dados.titulo.vencimento), { alinhamento: 'right', negrito: true });
  y += 8;

  // Row 2
  campo(doc, MARGEM, y, 35, 'Data do Documento', dataBr(dados.titulo.emissao));
  divisor(doc, MARGEM + 35, y);
  campo(doc, MARGEM + 35, y, 40, 'Nº Documento', dados.titulo.numeroDocumento);
  divisor(doc, MARGEM + 75, y);
  campo(doc, MARGEM + 75, y, 40, 'Impresso por', dados.titulo.impressoPor ?? 'Plataforma');
  divisor(doc, MARGEM + 115, y);
  campo(doc, MARGEM + 115, y, 40, 'Data do Processamento', dataBr(dados.titulo.emissao ?? new Date()));
  divisor(doc, MARGEM + 155, y);
  campo(doc, MARGEM + 155, y, 35, 'Nosso Número', calculado.nossoNumeroFormatado, { alinhamento: 'right' });
  y += 8;

  // Row 3 & Side Box
  doc.setFontSize(4.8);
  doc.setFont('helvetica', 'normal');
  doc.text('INSTRUÇÕES - TEXTO DE RESPONSABILIDADE DO BENEFICIÁRIO', MARGEM + 1, y + 2.5);
  doc.setLineWidth(0.1);
  doc.line(MARGEM, y + 24, MARGEM + 145, y + 24);
  divisor(doc, MARGEM + 145, y, 24);

  campo(doc, MARGEM + 145, y, 45, '(=)Valor do Documento', moeda(dados.titulo.valor), { alinhamento: 'right', negrito: true, altura: 6 });
  campo(doc, MARGEM + 145, y + 6, 45, '(-)Deduções', '', { alinhamento: 'right', altura: 6 });
  campo(doc, MARGEM + 145, y + 12, 45, '(+)Mora/Multa', '', { alinhamento: 'right', altura: 6 });
  campo(doc, MARGEM + 145, y + 18, 45, '(=)Valor Cobrado', '', { alinhamento: 'right', altura: 6 });
  y += 24;

  // Row 4: Pagador/Avalista
  campo(
    doc,
    MARGEM,
    y,
    190,
    'Pagador/Avalista',
    [dados.pagador.nome, documento(dados.pagador.documento), dados.pagador.endereco].filter(Boolean).join(' — '),
    { altura: 10 },
  );
  y += 12;

  linhaPontilhada(doc, y);
  y += 4;

  // ------------------------------------------------------------------
  // 2. VIA PAGADOR (Meio)
  // ------------------------------------------------------------------
  cabecalhoVia(doc, y, 'VIA PAGADOR', dados, logoImage);
  y += 8;

  // Row 1
  campo(doc, MARGEM, y, 115, 'Beneficiário', dados.beneficiario.nome);
  divisor(doc, MARGEM + 115, y);
  campo(doc, MARGEM + 115, y, 40, 'CNPJ', documento(dados.beneficiario.documento));
  divisor(doc, MARGEM + 155, y);
  campo(doc, MARGEM + 155, y, 35, 'Vencimento', dataBr(dados.titulo.vencimento), { alinhamento: 'right', negrito: true });
  y += 8;

  // Row 2
  campo(doc, MARGEM, y, 35, 'Data do Documento', dataBr(dados.titulo.emissao));
  divisor(doc, MARGEM + 35, y);
  campo(doc, MARGEM + 35, y, 40, 'Nº Documento', dados.titulo.numeroDocumento);
  divisor(doc, MARGEM + 75, y);
  campo(doc, MARGEM + 75, y, 25, 'Esp.Documento', dados.titulo.especieDocumento);
  divisor(doc, MARGEM + 100, y);
  campo(doc, MARGEM + 100, y, 15, 'Aceite', dados.titulo.aceite);
  divisor(doc, MARGEM + 115, y);
  campo(doc, MARGEM + 115, y, 40, 'Data do Processamento', dataBr(dados.titulo.emissao ?? new Date()));
  divisor(doc, MARGEM + 155, y);
  campo(doc, MARGEM + 155, y, 35, 'Agência/Código Beneficiário', dados.beneficiario.agenciaConta, { alinhamento: 'right' });
  y += 8;

  // Row 3
  campo(doc, MARGEM, y, 20, 'Uso Banco', '');
  divisor(doc, MARGEM + 20, y);
  campo(doc, MARGEM + 20, y, 15, 'CIP', '000');
  divisor(doc, MARGEM + 35, y);
  campo(doc, MARGEM + 35, y, 20, 'Carteira', dados.titulo.carteira);
  divisor(doc, MARGEM + 55, y);
  campo(doc, MARGEM + 55, y, 20, 'Espécie', 'R$');
  divisor(doc, MARGEM + 75, y);
  campo(doc, MARGEM + 75, y, 40, 'Quantidade', '');
  divisor(doc, MARGEM + 115, y);
  campo(doc, MARGEM + 115, y, 40, '(x)Valor', '');
  divisor(doc, MARGEM + 155, y);
  campo(doc, MARGEM + 155, y, 35, 'Nosso Número', calculado.nossoNumeroFormatado, { alinhamento: 'right' });
  y += 8;

  // Row 4 & Side Box
  doc.setFontSize(4.8);
  doc.setFont('helvetica', 'normal');
  doc.text('INSTRUÇÕES - TEXTO DE RESPONSABILIDADE DO BENEFICIÁRIO', MARGEM + 1, y + 2.5);
  doc.setFontSize(6.5);
  const linhasInstrucoesVia = dados.instrucoes
    .flatMap((i) => doc.splitTextToSize(i, 142) as string[])
    .slice(0, 7);
  doc.text(linhasInstrucoesVia, MARGEM + 1, y + 6);
  doc.setLineWidth(0.1);
  doc.line(MARGEM, y + 36, MARGEM + 145, y + 36);
  divisor(doc, MARGEM + 145, y, 36);

  campo(doc, MARGEM + 145, y, 45, '(=)Valor do Documento', moeda(dados.titulo.valor), { alinhamento: 'right', negrito: true, altura: 6 });
  campo(doc, MARGEM + 145, y + 6, 45, '(-)Desconto/Abatimento', '', { alinhamento: 'right', altura: 6 });
  campo(doc, MARGEM + 145, y + 12, 45, '(-)Outras Deduções', '', { alinhamento: 'right', altura: 6 });
  campo(doc, MARGEM + 145, y + 18, 45, '(+)Mora/Multa', '', { alinhamento: 'right', altura: 6 });
  campo(doc, MARGEM + 145, y + 24, 45, '(+)Outros Acréscimos', '', { alinhamento: 'right', altura: 6 });
  campo(doc, MARGEM + 145, y + 30, 45, '(=)Valor Cobrado', '', { alinhamento: 'right', altura: 6 });
  y += 36;

  // Row 5: Pagador/Avalista
  campo(
    doc,
    MARGEM,
    y,
    190,
    'Pagador/Avalista',
    [dados.pagador.nome, documento(dados.pagador.documento), dados.pagador.endereco].filter(Boolean).join(' — '),
    { altura: 10 },
  );
  y += 11;

  doc.setFontSize(5.6);
  doc.text('Autenticação Mecânica', MARGEM + LARGURA, y, { align: 'right' });
  y += 3;

  linhaPontilhada(doc, y);
  y += 4;

  // ------------------------------------------------------------------
  // 3. FICHA DE COMPENSAÇÃO (Base)
  // ------------------------------------------------------------------
  cabecalhoFichaCompensacao(doc, y, dados, calculado.linhaDigitavelFormatada, logoImage);
  y += 8;

  // Row 1
  campo(doc, MARGEM, y, 145, 'Local de Pagamento', dados.localPagamento);
  divisor(doc, MARGEM + 145, y);
  campo(doc, MARGEM + 145, y, 45, 'Vencimento', dataBr(dados.titulo.vencimento), { alinhamento: 'right', negrito: true, tamanho: 9 });
  y += 8;

  // Row 2
  campo(doc, MARGEM, y, 110, 'Beneficiário', dados.beneficiario.nome);
  divisor(doc, MARGEM + 110, y);
  campo(doc, MARGEM + 110, y, 35, 'CNPJ', documento(dados.beneficiario.documento));
  divisor(doc, MARGEM + 145, y);
  campo(doc, MARGEM + 145, y, 45, 'Agência/Código Beneficiário', dados.beneficiario.agenciaConta, { alinhamento: 'right' });
  y += 8;

  // Row 3
  campo(doc, MARGEM, y, 30, 'Data do Documento', dataBr(dados.titulo.emissao));
  divisor(doc, MARGEM + 30, y);
  campo(doc, MARGEM + 30, y, 35, 'Nº Documento', dados.titulo.numeroDocumento);
  divisor(doc, MARGEM + 65, y);
  campo(doc, MARGEM + 65, y, 25, 'Esp.Documento', dados.titulo.especieDocumento);
  divisor(doc, MARGEM + 90, y);
  campo(doc, MARGEM + 90, y, 15, 'Aceite', dados.titulo.aceite);
  divisor(doc, MARGEM + 105, y);
  campo(doc, MARGEM + 105, y, 40, 'Data do Processamento', dataBr(dados.titulo.emissao ?? new Date()));
  divisor(doc, MARGEM + 145, y);
  campo(doc, MARGEM + 145, y, 45, 'Nosso Número', calculado.nossoNumeroFormatado, { alinhamento: 'right' });
  y += 8;

  // Row 4
  campo(doc, MARGEM, y, 20, 'Uso Banco', '');
  divisor(doc, MARGEM + 20, y);
  campo(doc, MARGEM + 20, y, 15, 'CIP', '000');
  divisor(doc, MARGEM + 35, y);
  campo(doc, MARGEM + 35, y, 20, 'Carteira', dados.titulo.carteira);
  divisor(doc, MARGEM + 55, y);
  campo(doc, MARGEM + 55, y, 20, 'Espécie', 'R$');
  divisor(doc, MARGEM + 75, y);
  campo(doc, MARGEM + 75, y, 35, 'Quantidade', '');
  divisor(doc, MARGEM + 110, y);
  campo(doc, MARGEM + 110, y, 35, '(x)Valor', '');
  divisor(doc, MARGEM + 145, y);
  campo(doc, MARGEM + 145, y, 45, '(=)Valor do Documento', moeda(dados.titulo.valor), { alinhamento: 'right', negrito: true, tamanho: 9 });
  y += 8;

  // Row 5 & Side Box
  doc.setFontSize(4.8);
  doc.setFont('helvetica', 'normal');
  doc.text('INSTRUÇÕES - TEXTO DE RESPONSABILIDADE DO BENEFICIÁRIO', MARGEM + 1, y + 2.5);
  doc.setFontSize(6.5);
  const linhasInstrucoesFicha = dados.instrucoes
    .flatMap((i) => doc.splitTextToSize(i, 142) as string[])
    .slice(0, 7);
  doc.text(linhasInstrucoesFicha, MARGEM + 1, y + 6);
  doc.setLineWidth(0.1);
  doc.line(MARGEM, y + 36, MARGEM + 145, y + 36);
  divisor(doc, MARGEM + 145, y, 36);

  campo(doc, MARGEM + 145, y, 45, '(-)Desconto/Abatimento', '', { alinhamento: 'right', altura: 7.2 });
  campo(doc, MARGEM + 145, y + 7.2, 45, '(-)Outras Deduções', '', { alinhamento: 'right', altura: 7.2 });
  campo(doc, MARGEM + 145, y + 14.4, 45, '(+)Mora/Multa', '', { alinhamento: 'right', altura: 7.2 });
  campo(doc, MARGEM + 145, y + 21.6, 45, '(+)Outros Acréscimos', '', { alinhamento: 'right', altura: 7.2 });
  campo(doc, MARGEM + 145, y + 28.8, 45, '(=)Valor Cobrado', '', { alinhamento: 'right', altura: 7.2 });
  y += 36;

  // Row 6: Pagador/Avalista
  campo(
    doc,
    MARGEM,
    y,
    190,
    'Pagador/Avalista',
    [dados.pagador.nome, documento(dados.pagador.documento), dados.pagador.endereco].filter(Boolean).join(' — '),
    { altura: 10 },
  );
  y += 11;

  doc.setFontSize(5.6);
  doc.text('Autenticação Mecânica - Ficha de Compensação', MARGEM + LARGURA, y, { align: 'right' });
  y += 3;

  // Barcode
  const modulos = itfModulos(calculado.codigoBarras);
  const larguraModulo = 0.26;
  desenharBarras(doc, modulos, {
    x: MARGEM,
    y: y + 1,
    altura: 13,
    larguraModulo,
  });

  if (dados.demonstrativo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    const demonstrativo = doc.splitTextToSize(
      dados.demonstrativo,
      LARGURA - 105 - 4,
    ) as string[];
    doc.text(demonstrativo.slice(0, 6), MARGEM + 105, y + 4);
  }

  if (dados.marcaDagua) {
    desenharMarcaDagua(doc, dados.marcaDagua);
  }

  return {
    conteudo: Buffer.from(doc.output('arraybuffer')),
    linhaDigitavel: calculado.linhaDigitavel,
    linhaDigitavelFormatada: calculado.linhaDigitavelFormatada,
    codigoBarras: calculado.codigoBarras,
    nossoNumeroFormatado: calculado.nossoNumeroFormatado,
  };
}
