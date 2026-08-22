import { jsPDF } from 'jspdf';
import {
  desenharBarras,
  itfModulos,
  larguraBarras,
} from '../../common/pdf/barcode';
import { montarBoleto, type BoletoEntrada } from './boleto-codigo';

/**
 * Ficha de compensação (boleto) em PDF — a 2ª via que o cliente pede pelo
 * WhatsApp (ver `docs/planos/segunda-via-danfe-boleto.md`).
 *
 * É **reimpressão**: o título já foi registrado no banco pelo ERP, e o nosso
 * número veio de lá. Nada aqui numera, registra ou baixa cobrança — o papel
 * reproduz o boleto que já existe.
 *
 * O layout segue a ficha de compensação da FEBRABAN: recibo do pagador em
 * cima, ficha destacável embaixo, código de barras 2 de 5 intercalado com o
 * X dentro da faixa que os leitores de caixa exigem.
 */

const MARGEM = 12;
const LARGURA = 210 - MARGEM * 2;

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
  banco: { codigo: string; nome: string };
  beneficiario: {
    nome: string;
    documento: string | null;
    endereco: string | null;
    /** "1234-5 / 0567890-1", como sai impresso na ficha. */
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
  };
  localPagamento: string;
  instrucoes: string[];
  demonstrativo: string | null;
  codigo: BoletoEntrada;
};

/** Campo da ficha: rótulo miúdo em cima, valor embaixo, linha inferior. */
function campo(
  doc: jsPDF,
  x: number,
  y: number,
  largura: number,
  rotulo: string,
  valor: string,
  opcoes: { alinhamento?: 'left' | 'right'; negrito?: boolean; tamanho?: number } = {},
) {
  const altura = 8;
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

/** Separador vertical entre campos da mesma faixa. */
function divisor(doc: jsPDF, x: number, y: number, altura = 8) {
  doc.setLineWidth(0.1);
  doc.line(x, y, x, y + altura);
}

/** Cabeçalho da ficha: logo textual do banco, código e linha digitável. */
function cabecalho(doc: jsPDF, y: number, dados: BoletoPdfDados, linhaDigitavel: string) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(dados.banco.nome, MARGEM + 1, y + 6);

  divisor(doc, MARGEM + 40, y, 8);
  doc.setFontSize(12);
  doc.text(`${dados.banco.codigo}-9`, MARGEM + 46, y + 6);
  divisor(doc, MARGEM + 62, y, 8);

  doc.setFontSize(10.5);
  doc.text(linhaDigitavel, MARGEM + LARGURA, y + 6, { align: 'right' });

  doc.setLineWidth(0.4);
  doc.line(MARGEM, y + 8, MARGEM + LARGURA, y + 8);
  doc.setLineWidth(0.1);
}

/**
 * Monta o boleto e devolve os bytes do PDF.
 *
 * Se o título não tiver como formar um código de barras válido (sem nosso
 * número, sem vencimento, banco sem gerador), `montarBoleto` lança
 * `BoletoInvalidoError` — quem chama traduz para 409 com o motivo. Um boleto
 * "quase certo" é pior do que nenhum: o cliente só descobre no caixa.
 */
export function montarBoletoPdf(dados: BoletoPdfDados): {
  conteudo: Buffer;
  linhaDigitavel: string;
  linhaDigitavelFormatada: string;
  codigoBarras: string;
  nossoNumeroFormatado: string;
} {
  const calculado = montarBoleto(dados.codigo);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const c2 = LARGURA * 0.62;

  // ------------------------------------------------------------------
  // Recibo do pagador — a via que fica com quem paga.
  // ------------------------------------------------------------------
  let y = MARGEM;
  cabecalho(doc, y, dados, calculado.linhaDigitavelFormatada);
  y += 8;

  campo(doc, MARGEM, y, c2, 'Beneficiário', `${dados.beneficiario.nome} — ${documento(dados.beneficiario.documento)}`);
  divisor(doc, MARGEM + c2, y);
  campo(doc, MARGEM + c2, y, LARGURA - c2, 'Agência / Código do beneficiário', dados.beneficiario.agenciaConta, { alinhamento: 'right' });
  y += 8;

  const quarto = LARGURA / 4;
  campo(doc, MARGEM, y, quarto, 'Nosso número', calculado.nossoNumeroFormatado);
  divisor(doc, MARGEM + quarto, y);
  campo(doc, MARGEM + quarto, y, quarto, 'Número do documento', dados.titulo.numeroDocumento);
  divisor(doc, MARGEM + quarto * 2, y);
  campo(doc, MARGEM + quarto * 2, y, quarto, 'Vencimento', dataBr(dados.titulo.vencimento), { negrito: true });
  divisor(doc, MARGEM + quarto * 3, y);
  campo(doc, MARGEM + quarto * 3, y, quarto, 'Valor do documento', moeda(dados.titulo.valor), {
    alinhamento: 'right',
    negrito: true,
  });
  y += 8;

  campo(doc, MARGEM, y, LARGURA, 'Pagador', `${dados.pagador.nome} — ${documento(dados.pagador.documento)}`);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.6);
  doc.text('RECIBO DO PAGADOR — AUTENTICAÇÃO MECÂNICA', MARGEM + LARGURA, y - 1.5, {
    align: 'right',
  });

  // Linha de corte entre as duas vias.
  doc.setLineDashPattern([1.2, 1.2], 0);
  doc.line(MARGEM, y + 2, MARGEM + LARGURA, y + 2);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(5);
  doc.text('corte na linha pontilhada', MARGEM, y + 1);

  // ------------------------------------------------------------------
  // Ficha de compensação — a via que vai para o banco.
  // ------------------------------------------------------------------
  y += 8;
  cabecalho(doc, y, dados, calculado.linhaDigitavelFormatada);
  y += 8;

  campo(doc, MARGEM, y, c2, 'Local de pagamento', dados.localPagamento);
  divisor(doc, MARGEM + c2, y);
  campo(doc, MARGEM + c2, y, LARGURA - c2, 'Vencimento', dataBr(dados.titulo.vencimento), {
    alinhamento: 'right',
    negrito: true,
    tamanho: 9,
  });
  y += 8;

  campo(
    doc,
    MARGEM,
    y,
    c2,
    'Beneficiário',
    [dados.beneficiario.nome, documento(dados.beneficiario.documento), dados.beneficiario.endereco]
      .filter(Boolean)
      .join(' — '),
  );
  divisor(doc, MARGEM + c2, y);
  campo(doc, MARGEM + c2, y, LARGURA - c2, 'Agência / Código do beneficiário', dados.beneficiario.agenciaConta, {
    alinhamento: 'right',
  });
  y += 8;

  const faixa = c2 / 5;
  campo(doc, MARGEM, y, faixa, 'Data do documento', dataBr(dados.titulo.emissao));
  divisor(doc, MARGEM + faixa, y);
  campo(doc, MARGEM + faixa, y, faixa, 'Nº do documento', dados.titulo.numeroDocumento);
  divisor(doc, MARGEM + faixa * 2, y);
  campo(doc, MARGEM + faixa * 2, y, faixa, 'Espécie doc.', dados.titulo.especieDocumento);
  divisor(doc, MARGEM + faixa * 3, y);
  campo(doc, MARGEM + faixa * 3, y, faixa, 'Aceite', dados.titulo.aceite);
  divisor(doc, MARGEM + faixa * 4, y);
  campo(doc, MARGEM + faixa * 4, y, faixa, 'Data process.', dataBr(new Date()));
  divisor(doc, MARGEM + c2, y);
  campo(doc, MARGEM + c2, y, LARGURA - c2, 'Nosso número', calculado.nossoNumeroFormatado, {
    alinhamento: 'right',
  });
  y += 8;

  campo(doc, MARGEM, y, faixa, 'Uso do banco', '');
  divisor(doc, MARGEM + faixa, y);
  campo(doc, MARGEM + faixa, y, faixa, 'Carteira', dados.titulo.carteira);
  divisor(doc, MARGEM + faixa * 2, y);
  campo(doc, MARGEM + faixa * 2, y, faixa, 'Espécie', 'R$');
  divisor(doc, MARGEM + faixa * 3, y);
  campo(doc, MARGEM + faixa * 3, y, faixa * 2, 'Quantidade', '');
  divisor(doc, MARGEM + c2, y);
  campo(doc, MARGEM + c2, y, LARGURA - c2, '(=) Valor do documento', moeda(dados.titulo.valor), {
    alinhamento: 'right',
    negrito: true,
    tamanho: 9,
  });
  y += 8;

  // Instruções + os cinco campos de acréscimo/dedução da FEBRABAN.
  const alturaInstrucoes = 32;
  doc.setFontSize(4.8);
  doc.text('INSTRUÇÕES (TEXTO DE RESPONSABILIDADE DO BENEFICIÁRIO)', MARGEM + 1, y + 2.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6);
  const linhas = dados.instrucoes
    .flatMap((i) => doc.splitTextToSize(i, c2 - 3) as string[])
    .slice(0, 8);
  doc.text(linhas, MARGEM + 1, y + 6);

  const rotulos = [
    '(-) Desconto / Abatimento',
    '(-) Outras deduções',
    '(+) Mora / Multa',
    '(+) Outros acréscimos',
    '(=) Valor cobrado',
  ];
  rotulos.forEach((rotulo, i) => {
    campo(doc, MARGEM + c2, y + i * 6.4, LARGURA - c2, rotulo, '', { alinhamento: 'right' });
  });
  divisor(doc, MARGEM + c2, y, alturaFaixaInstrucoes(alturaInstrucoes, rotulos.length));
  y += alturaFaixaInstrucoes(alturaInstrucoes, rotulos.length);

  campo(
    doc,
    MARGEM,
    y,
    LARGURA,
    'Pagador',
    [dados.pagador.nome, documento(dados.pagador.documento)].filter(Boolean).join(' — '),
  );
  y += 8;
  campo(doc, MARGEM, y, LARGURA, 'Endereço do pagador', dados.pagador.endereco ?? '');
  y += 10;

  doc.setFontSize(5.6);
  doc.text('FICHA DE COMPENSAÇÃO — AUTENTICAÇÃO MECÂNICA', MARGEM + LARGURA, y - 2, {
    align: 'right',
  });

  // ------------------------------------------------------------------
  // Código de barras: 2 de 5 intercalado, 44 dígitos.
  // ------------------------------------------------------------------
  const modulos = itfModulos(calculado.codigoBarras);
  // X de 0,26 mm fica dentro da faixa aceita pelos leitores (0,254–0,318) e
  // deixa o código com ~103 mm, a largura da ficha padrão.
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
      LARGURA - larguraBarras(modulos, larguraModulo) - 4,
    ) as string[];
    doc.text(
      demonstrativo.slice(0, 6),
      MARGEM + larguraBarras(modulos, larguraModulo) + 4,
      y + 4,
    );
  }

  return {
    conteudo: Buffer.from(doc.output('arraybuffer')),
    linhaDigitavel: calculado.linhaDigitavel,
    linhaDigitavelFormatada: calculado.linhaDigitavelFormatada,
    codigoBarras: calculado.codigoBarras,
    nossoNumeroFormatado: calculado.nossoNumeroFormatado,
  };
}

/** Altura da faixa de instruções: a maior entre o texto e a pilha de campos. */
function alturaFaixaInstrucoes(alturaTexto: number, quantidadeCampos: number) {
  return Math.max(alturaTexto, quantidadeCampos * 6.4);
}
