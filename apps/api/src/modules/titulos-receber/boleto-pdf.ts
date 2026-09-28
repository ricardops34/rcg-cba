import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { jsPDF } from 'jspdf';
import { desenharBarras, itfModulos } from '../../common/pdf/barcode';
import { HORARIO_TIMEZONE } from '../../common/horario/horario-trabalho';
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

/**
 * Data do título (vencimento, emissão). Chega do ERP como meia-noite UTC de
 * uma data sem hora, então é lida em UTC: no fuso da máquina, qualquer
 * servidor a oeste de Greenwich imprimia o dia anterior.
 */
const dataBr = (v: Date | string | null | undefined) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

/**
 * "Data do Processamento" é o dia em que o boleto foi impresso, como no ERP —
 * não a emissão do título. No fuso da operação, para não virar o dia às 20h.
 */
const hojeBr = () =>
  new Date().toLocaleDateString('pt-BR', { timeZone: HORARIO_TIMEZONE });

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
  /**
   * Os campos separados, e não uma linha pronta: o bloco sai em três linhas
   * no padrão do boleto do ERP (ver `linhasPagador`).
   */
  pagador: {
    /** Código-loja do cliente no ERP (ex.: `004199-01`). */
    codigo: string | null;
    nome: string;
    documento: string | null;
    /** Logradouro com número, como no cadastro. */
    endereco: string | null;
    bairro: string | null;
    municipio: string | null;
    uf: string | null;
    cep: string | null;
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

/**
 * O pagador em três linhas, no padrão do boleto do ERP:
 *
 *     (004199-01) IPE DOURADO CAFE E RESTAURANTE LTDA
 *     AV. MARGINAL LESTE,10105-CHAC. CASTELO II
 *     DOURADOS-MS CEP:79842-000 CNPJ: 19.123.290/0001-99
 *
 * Parte vazia some sem deixar separador sobrando.
 */
export function linhasPagador(p: BoletoPdfDados['pagador']): string[] {
  const limpo = (v: string | null | undefined) => (v ?? '').trim();

  const linha1 = [p.codigo ? `(${limpo(p.codigo)})` : '', limpo(p.nome)]
    .filter(Boolean)
    .join(' ');

  const linha2 = [limpo(p.endereco), limpo(p.bairro)].filter(Boolean).join('-');

  const cepDigitos = limpo(p.cep).replace(/\D/g, '');
  const cep =
    cepDigitos.length === 8
      ? `${cepDigitos.slice(0, 5)}-${cepDigitos.slice(5)}`
      : limpo(p.cep);
  const docDigitos = limpo(p.documento).replace(/\D/g, '');
  const rotuloDoc = docDigitos.length === 11 ? 'CPF' : 'CNPJ';

  const linha3 = [
    [limpo(p.municipio), limpo(p.uf)].filter(Boolean).join('-'),
    cep ? `CEP:${cep}` : '',
    docDigitos ? `${rotuloDoc}: ${documento(p.documento)}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return [linha1, linha2, linha3].filter(Boolean);
}

// ---------------------------------------------------------------------------
// Desenho — no padrão do boleto impresso pelo ERP (Protheus). As colunas foram
// medidas no PDF de referência: a da direita (vencimento, valores) tem ~33 mm
// e começa em 157,6 mm; as divisórias internas caem nos mesmos pontos em todas
// as vias.
// ---------------------------------------------------------------------------

/** Início da coluna da direita, a partir da margem. */
const COL_DIR = 157.6;
/** Largura da coluna da direita. */
const LARG_DIR = LARGURA - COL_DIR;
/** Altura de uma linha de campos. */
const ALT_LINHA = 7;
/** Altura do bloco do pagador (três linhas). */
const ALT_PAGADOR = 13;
/** Cinza das caixas de destaque (vencimento e valor do documento). */
const CINZA = 217;

type Alinhamento = 'left' | 'right';

/**
 * Uma caixa: borda, rótulo miúdo em cima (como vem, com minúsculas) e valor
 * em negrito embaixo. `cinza` pinta o fundo, como o ERP faz no vencimento e
 * no valor do documento.
 */
function caixa(
  doc: jsPDF,
  x: number,
  y: number,
  largura: number,
  altura: number,
  rotulo: string,
  valor: string,
  opcoes: { alinhamento?: Alinhamento; cinza?: boolean; tamanho?: number } = {},
) {
  doc.setLineWidth(0.15);
  if (opcoes.cinza) {
    doc.setFillColor(CINZA, CINZA, CINZA);
    doc.rect(x, y, largura, altura, 'FD');
  } else {
    doc.rect(x, y, largura, altura);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.text(rotulo, x + 0.8, y + 2.2);

  if (!valor) return;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(opcoes.tamanho ?? 7.5);
  const texto =
    (doc.splitTextToSize(valor, largura - 1.6) as string[])[0] ?? '';
  const alinhamento = opcoes.alinhamento ?? 'left';
  doc.text(
    texto,
    alinhamento === 'right' ? x + largura - 0.8 : x + 0.8,
    y + altura - 1.4,
    { align: alinhamento },
  );
}

/**
 * Uma linha de campos da esquerda, com a caixa da coluna da direita.
 * `campos` são `[rótulo, valor, largura]`; a última caixa da esquerda estica
 * até a coluna da direita.
 */
function linhaCampos(
  doc: jsPDF,
  y: number,
  campos: Array<[string, string, number?]>,
  direita: { rotulo: string; valor: string; cinza?: boolean; tamanho?: number },
) {
  let x = MARGEM;
  campos.forEach(([rotulo, valor, largura], i) => {
    const w = i === campos.length - 1 ? MARGEM + COL_DIR - x : (largura ?? 0);
    caixa(doc, x, y, w, ALT_LINHA, rotulo, valor);
    x += w;
  });
  caixa(
    doc,
    MARGEM + COL_DIR,
    y,
    LARG_DIR,
    ALT_LINHA,
    direita.rotulo,
    direita.valor,
    { alinhamento: 'right', cinza: direita.cinza, tamanho: direita.tamanho },
  );
}

/**
 * O bloco de baixo de cada via: à esquerda as instruções e, embaixo delas, o
 * pagador; à direita as caixas de valor, dividindo a mesma altura. Devolve a
 * altura usada.
 */
function blocoValores(
  doc: jsPDF,
  y: number,
  dados: BoletoPdfDados,
  opcoes: {
    alturaInstrucoes: number;
    instrucoes: string[];
    valores: Array<{ rotulo: string; valor?: string; cinza?: boolean }>;
  },
): number {
  const altura = opcoes.alturaInstrucoes + ALT_PAGADOR;

  // Instruções
  doc.setLineWidth(0.15);
  doc.rect(MARGEM, y, COL_DIR, opcoes.alturaInstrucoes);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.text(
    'Instruções - Texto de Responsabilidade do Beneficiário',
    MARGEM + 0.8,
    y + 2.2,
  );
  if (opcoes.instrucoes.length) {
    doc.setFontSize(8.5);
    const cabem = Math.max(1, Math.floor((opcoes.alturaInstrucoes - 4) / 3.4));
    const linhas = opcoes.instrucoes
      .flatMap((l) => doc.splitTextToSize(l, COL_DIR - 3) as string[])
      .slice(0, cabem);
    linhas.forEach((linha, i) =>
      doc.text(linha, MARGEM + 1.5, y + 5.6 + i * 3.4),
    );
  }

  // Pagador
  const yPag = y + opcoes.alturaInstrucoes;
  doc.rect(MARGEM, yPag, COL_DIR, ALT_PAGADOR);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.text('Pagador/Avalista', MARGEM + 0.8, yPag + 2.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  linhasPagador(dados.pagador)
    .slice(0, 3)
    .forEach((linha, i) => {
      const texto =
        (doc.splitTextToSize(linha, COL_DIR - 2) as string[])[0] ?? '';
      doc.text(texto, MARGEM + 0.8, yPag + 5.2 + i * 2.8);
    });

  // Coluna de valores, na mesma altura
  const alturaCaixa = altura / opcoes.valores.length;
  opcoes.valores.forEach((v, i) => {
    caixa(
      doc,
      MARGEM + COL_DIR,
      y + i * alturaCaixa,
      LARG_DIR,
      alturaCaixa,
      v.rotulo,
      v.valor ?? '',
      { alinhamento: 'right', cinza: v.cinza },
    );
  });

  return altura;
}

/** Linha pontilhada de corte. */
function linhaPontilhada(doc: jsPDF, y: number) {
  doc.setLineWidth(0.1);
  doc.setLineDashPattern([0.8, 0.8], 0);
  doc.line(MARGEM, y, MARGEM + LARGURA, y);
  doc.setLineDashPattern([], 0);
}

/** Desenha a logo do banco ou o nome em texto, no primeiro box do cabeçalho. */
function desenharLogoOuNome(
  doc: jsPDF,
  x: number,
  y: number,
  altura: number,
  dados: BoletoPdfDados,
  logoImage?: { dados: string; formato: 'PNG' | 'JPEG' } | null,
) {
  if (logoImage) {
    try {
      const props = doc.getImageProperties(logoImage.dados);
      const escala = Math.min(38 / props.width, (altura - 1.5) / props.height);
      const w = props.width * escala;
      const h = props.height * escala;
      doc.addImage(
        logoImage.dados,
        logoImage.formato,
        x + 1.5,
        y + (altura - h) / 2,
        w,
        h,
      );
      return;
    } catch {
      // cai no nome em texto
    }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(dados.banco.nome, x + 1.5, y + altura - 2);
}

/** Cabeçalho das vias Empresa e Pagador: logo, dois boxes vazios e o título. */
function cabecalhoVia(
  doc: jsPDF,
  y: number,
  tituloVia: 'VIA EMPRESA' | 'VIA PAGADOR',
  dados: BoletoPdfDados,
  logoImage?: { dados: string; formato: 'PNG' | 'JPEG' } | null,
) {
  const altura = 8;
  doc.setLineWidth(0.15);
  doc.rect(MARGEM, y, 50, altura);
  doc.rect(MARGEM + 50, y, 22, altura);
  doc.rect(MARGEM + 72, y, COL_DIR - 72, altura);
  doc.rect(MARGEM + COL_DIR, y, LARG_DIR, altura);
  desenharLogoOuNome(doc, MARGEM, y, altura, dados, logoImage);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(tituloVia, MARGEM + LARGURA - 1.5, y + 3.2, { align: 'right' });
}

/** Cabeçalho da Ficha de Compensação: logo, código do banco e linha digitável. */
function cabecalhoFichaCompensacao(
  doc: jsPDF,
  y: number,
  dados: BoletoPdfDados,
  linhaDigitavel: string,
  logoImage?: { dados: string; formato: 'PNG' | 'JPEG' } | null,
) {
  const altura = 9;
  doc.setLineWidth(0.15);
  doc.rect(MARGEM, y, 50, altura);
  doc.rect(MARGEM + 50, y, 22, altura);
  doc.rect(MARGEM + 72, y, LARGURA - 72, altura);
  desenharLogoOuNome(doc, MARGEM, y, altura, dados, logoImage);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(formatarCodigoBanco(dados.banco.codigo), MARGEM + 61, y + 6.5, {
    align: 'center',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(linhaDigitavel, MARGEM + 74, y + 6.5);
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

  const vencimento = dataBr(dados.titulo.vencimento);
  const emissao = dataBr(dados.titulo.emissao);
  const processamento = hojeBr();
  const valorDocumento = moeda(dados.titulo.valor);
  const cnpjBeneficiario = documento(dados.beneficiario.documento);

  // ------------------------------------------------------------------
  // 1. VIA EMPRESA
  // ------------------------------------------------------------------
  let y = 10;
  cabecalhoVia(doc, y, 'VIA EMPRESA', dados, logoImage);
  y += 8;

  linhaCampos(
    doc,
    y,
    [
      ['Beneficiário', dados.beneficiario.nome, 126.8],
      ['CNPJ', cnpjBeneficiario],
    ],
    { rotulo: 'Vencimento', valor: vencimento, cinza: true },
  );
  y += ALT_LINHA;

  linhaCampos(
    doc,
    y,
    [
      ['Data do Documento', emissao, 35.6],
      ['Nº Documento', dados.titulo.numeroDocumento, 49],
      ['Impresso por', dados.titulo.impressoPor ?? 'Plataforma', 42.2],
      ['Data do Processamento', processamento],
    ],
    { rotulo: 'Nosso Número', valor: calculado.nossoNumeroFormatado },
  );
  y += ALT_LINHA;

  // O ERP não repete as instruções na via da empresa
  y += blocoValores(doc, y, dados, {
    alturaInstrucoes: 13,
    instrucoes: [],
    valores: [
      { rotulo: '(=)Valor do Documento', valor: valorDocumento, cinza: true },
      { rotulo: '(-)Deduções' },
      { rotulo: '(+)Mora/Multa' },
      { rotulo: '(=)Valor Cobrado' },
    ],
  });

  y += 5;
  linhaPontilhada(doc, y);
  y += 5;

  // ------------------------------------------------------------------
  // 2. VIA PAGADOR
  // ------------------------------------------------------------------
  cabecalhoVia(doc, y, 'VIA PAGADOR', dados, logoImage);
  y += 8;

  linhaCampos(
    doc,
    y,
    [
      ['Beneficiário', dados.beneficiario.nome, 126.8],
      ['CNPJ', cnpjBeneficiario],
    ],
    { rotulo: 'Vencimento', valor: vencimento, cinza: true },
  );
  y += ALT_LINHA;

  linhaCampos(
    doc,
    y,
    [
      ['Data do Documento', emissao, 35.6],
      ['Nº Documento', dados.titulo.numeroDocumento, 49],
      ['Esp.Documento', dados.titulo.especieDocumento, 23.1],
      ['Aceite', dados.titulo.aceite, 19.1],
      ['Data do Processamento', processamento],
    ],
    {
      rotulo: 'Agência/Código Beneficiário',
      valor: dados.beneficiario.agenciaConta,
    },
  );
  y += ALT_LINHA;

  linhaCampos(
    doc,
    y,
    [
      ['Uso Banco', '', 17],
      ['CIP', '000', 18.6],
      ['Carteira', dados.titulo.carteira, 22],
      ['Espécie', 'R$', 27],
      ['Quantidade', '', 42.2],
      ['(x)Valor', ''],
    ],
    { rotulo: 'Nosso Número', valor: calculado.nossoNumeroFormatado },
  );
  y += ALT_LINHA;

  y += blocoValores(doc, y, dados, {
    alturaInstrucoes: 29,
    instrucoes: dados.instrucoes,
    valores: [
      { rotulo: '(=)Valor do Documento', valor: valorDocumento, cinza: true },
      { rotulo: '(-)Desconto/Abatimento' },
      { rotulo: '(-)Outras Deduções' },
      { rotulo: '(+)Mora/Multa' },
      { rotulo: '(+)Outros Acréscimos' },
      { rotulo: '(=)Valor Cobrado' },
    ],
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text('Autenticação Mecânica', MARGEM + LARGURA - 20, y + 3, {
    align: 'right',
  });
  y += 10;
  linhaPontilhada(doc, y);
  y += 5;

  // ------------------------------------------------------------------
  // 3. FICHA DE COMPENSAÇÃO — a coluna da direita segue a ordem do ERP:
  //    vencimento, CNPJ, agência, nosso número e os valores
  // ------------------------------------------------------------------
  cabecalhoFichaCompensacao(
    doc,
    y,
    dados,
    calculado.linhaDigitavelFormatada,
    logoImage,
  );
  y += 9;

  linhaCampos(doc, y, [['Local de Pagamento', dados.localPagamento]], {
    rotulo: 'Vencimento',
    valor: vencimento,
    cinza: true,
  });
  y += ALT_LINHA;

  linhaCampos(doc, y, [['Beneficiário', dados.beneficiario.nome]], {
    rotulo: 'CNPJ',
    valor: cnpjBeneficiario,
  });
  y += ALT_LINHA;

  linhaCampos(
    doc,
    y,
    [
      ['Data do Documento', emissao, 35.6],
      ['Nº Documento', dados.titulo.numeroDocumento, 49],
      ['Esp.Documento', dados.titulo.especieDocumento, 23.1],
      ['Aceite', dados.titulo.aceite, 19.1],
      ['Data do Processamento', processamento],
    ],
    {
      rotulo: 'Agência/Código Beneficiário',
      valor: dados.beneficiario.agenciaConta,
    },
  );
  y += ALT_LINHA;

  linhaCampos(
    doc,
    y,
    [
      ['Uso Banco', '', 17],
      ['CIP', '000', 18.6],
      ['Carteira', dados.titulo.carteira, 22],
      ['Espécie', 'R$', 27],
      ['Quantidade', '', 42.2],
      ['(x)Valor', ''],
    ],
    { rotulo: 'Nosso Número', valor: calculado.nossoNumeroFormatado },
  );
  y += ALT_LINHA;

  y += blocoValores(doc, y, dados, {
    alturaInstrucoes: 29,
    instrucoes: dados.instrucoes,
    valores: [
      { rotulo: '(=)Valor do Documento', valor: valorDocumento, cinza: true },
      { rotulo: '(-)Desconto/Abatimento' },
      { rotulo: '(-)Outras Deduções' },
      { rotulo: '(+)Mora/Multa' },
      { rotulo: '(+)Outros Acréscimos' },
      { rotulo: '(=)Valor Cobrado' },
    ],
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text(
    'Autenticação Mecânica - Ficha de Compensação',
    MARGEM + LARGURA,
    y + 3,
    {
      align: 'right',
    },
  );
  y += 5;

  // Código de barras
  const modulos = itfModulos(calculado.codigoBarras);
  desenharBarras(doc, modulos, {
    x: MARGEM,
    y: y + 1,
    altura: 13,
    larguraModulo: 0.26,
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
