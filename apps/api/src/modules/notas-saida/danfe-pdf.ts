import { jsPDF } from 'jspdf';
import {
  code128cModulos,
  desenharBarras,
  larguraBarras,
} from '../../common/pdf/barcode';
import type { LogoPdf } from '../../common/pdf/carregar-logo';
import type { NfeDados, NfeItem } from './nfe-xml';

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
 * O layout reproduz o DANFE retrato que o Protheus imprime (pedido do usuário,
 * 01/10/2026, com o PDF do ERP como modelo): mesmos quadros, na mesma ordem,
 * com a mesma composição de campos — o cliente recebe pelo WhatsApp o mesmo
 * papel que receberia do faturamento. Datas e horas saem como estão no XML,
 * sem conversão de fuso: o protocolo diz "13:27:10" no ERP, e aqui também.
 */

const MARGEM = 7;
const LARGURA_PAGINA = 210;
const ALTURA_PAGINA = 297;
const W = LARGURA_PAGINA - MARGEM * 2;
const FONTE = 'times';
/** Altura de um quadro de uma linha (rótulo + valor). */
const H = 7;

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

const decimal = (v: number | null | undefined, casas = 2) =>
  (v ?? 0).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

const percentual = (v: number | null | undefined) => `${decimal(v)}%`;

/** "2025-06-10T13:27:10-04:00" → "10/06/2025", sem passar por fuso. */
const dataBr = (v: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/** "2025-06-10T13:27:10-04:00" → "13:27:10"; só data, vazio. */
const horaBr = (v: string | null | undefined) =>
  /T(\d{2}:\d{2}:\d{2})/.exec(v ?? '')?.[1] ?? '';

const documento = (v: string | null | undefined) => {
  const d = (v ?? '').replace(/\D/g, '');
  if (d.length === 14)
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11)
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return v ?? '';
};

const cep = (v: string | null | undefined) => {
  const d = (v ?? '').replace(/\D/g, '');
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : (v ?? '');
};

/** Número da nota com 9 dígitos, como o ERP imprime: "N. 000109221". */
const numeroNota = (v: string | null | undefined) =>
  v ? `N. ${v.replace(/^0+/, '').padStart(9, '0')}` : 'N.';

/** A chave sai impressa em blocos de quatro — é assim que se confere no portal. */
const chaveFormatada = (chave: string) =>
  chave.replace(/(\d{4})(?=\d)/g, '$1 ');

/** Rótulos do modFrete como o DANFE do ERP os escreve. */
const MODALIDADE_FRETE: Record<string, string> = {
  '0': '0-REMETENTE',
  '1': '1-DESTINATARIO',
  '2': '2-TERCEIROS',
  '3': '3-PROPRIO REMETENTE',
  '4': '4-PROPRIO DESTINATARIO',
  '9': '9-SEM FRETE',
};

// ---------------------------------------------------------------------------
// Primitivas de desenho
// ---------------------------------------------------------------------------

type Alinhamento = 'left' | 'center' | 'right';

/**
 * Quadro do formulário: moldura, rótulo miúdo em negrito e valor.
 *
 * O valor é cortado na largura do quadro em vez de quebrar linha: no DANFE
 * cada quadro tem altura fixa, e texto transbordando invadiria o vizinho.
 */
function campo(
  doc: jsPDF,
  x: number,
  y: number,
  largura: number,
  altura: number,
  rotulo: string,
  valor: string,
  opcoes: {
    alinhamento?: Alinhamento;
    tamanho?: number;
    negrito?: boolean;
  } = {},
) {
  doc.setLineWidth(0.15);
  doc.rect(x, y, largura, altura);

  doc.setFont(FONTE, 'bold');
  // Rótulo longo em quadro estreito ("BASE DE CALCULO DO ICMS SUBSTITUIÇÃO")
  // encolhe até caber, em vez de invadir o quadro ao lado.
  let tamanhoRotulo = 5.2;
  doc.setFontSize(tamanhoRotulo);
  while (tamanhoRotulo > 3.6 && doc.getTextWidth(rotulo) > largura - 1.6) {
    tamanhoRotulo -= 0.2;
    doc.setFontSize(tamanhoRotulo);
  }
  doc.text(rotulo, x + 0.8, y + 2.2);

  doc.setFont(FONTE, opcoes.negrito ? 'bold' : 'normal');
  doc.setFontSize(opcoes.tamanho ?? 7.5);
  const texto =
    (doc.splitTextToSize(valor || '', largura - 1.6) as string[])[0] ?? '';
  const alinhamento = opcoes.alinhamento ?? 'left';
  const posX =
    alinhamento === 'right'
      ? x + largura - 0.8
      : alinhamento === 'center'
        ? x + largura / 2
        : x + 0.8;
  doc.text(texto, posX, y + altura - 1.3, { align: alinhamento });
}

/** Linha de quadros lado a lado; as larguras somam a largura útil. */
function linhaDeCampos(
  doc: jsPDF,
  y: number,
  quadros: Array<{
    largura: number;
    rotulo: string;
    valor: string;
    alinhamento?: Alinhamento;
    negrito?: boolean;
  }>,
  altura = H,
) {
  let x = MARGEM;
  for (const q of quadros) {
    campo(doc, x, y, q.largura, altura, q.rotulo, q.valor, {
      alinhamento: q.alinhamento,
      negrito: q.negrito,
    });
    x += q.largura;
  }
  return y + altura;
}

/** Quadro com texto que quebra linha (dados adicionais). */
function campoMultilinha(
  doc: jsPDF,
  x: number,
  y: number,
  largura: number,
  altura: number,
  rotulo: string,
  valor: string,
) {
  doc.setLineWidth(0.15);
  doc.rect(x, y, largura, altura);
  doc.setFont(FONTE, 'bold');
  doc.setFontSize(5.2);
  doc.text(rotulo, x + 0.8, y + 2.2);

  doc.setFont(FONTE, 'normal');
  doc.setFontSize(6.5);
  const linhas = valor
    .split('\n')
    .flatMap((parte) => doc.splitTextToSize(parte, largura - 1.6) as string[]);
  const cabem = Math.max(0, Math.floor((altura - 3.5) / 2.7));
  doc.text(linhas.slice(0, cabem), x + 0.8, y + 5);
}

/** Título de seção ("DESTINATARIO/REMETENTE"), em cima do quadro. */
function secao(doc: jsPDF, y: number, titulo: string) {
  doc.setFont(FONTE, 'bold');
  doc.setFontSize(6);
  doc.text(titulo, MARGEM, y + 2.3);
  return y + 3;
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

// ---------------------------------------------------------------------------
// Blocos
// ---------------------------------------------------------------------------

/** Canhoto: recibo de entrega destacável, só na primeira folha. */
function canhoto(doc: jsPDF, nfe: NfeDados, y: number) {
  const larguraNota = 30;
  const larguraRecibo = W - larguraNota;
  const altura = 16;

  doc.setLineWidth(0.15);
  doc.rect(MARGEM, y, larguraRecibo, altura);
  doc.setFont(FONTE, 'normal');
  doc.setFontSize(6.5);
  doc.text(
    `RECEBEMOS DE ${nfe.emitente.nome ?? ''} OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO`,
    MARGEM + 0.8,
    y + 3,
    { maxWidth: larguraRecibo - 1.6 },
  );
  doc.line(MARGEM, y + 5.5, MARGEM + larguraRecibo, y + 5.5);
  doc.line(MARGEM + 42, y + 5.5, MARGEM + 42, y + altura);
  doc.setFont(FONTE, 'bold');
  doc.setFontSize(5.2);
  doc.text('DATA DE RECEBIMENTO', MARGEM + 0.8, y + 7.8);
  doc.text('IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR', MARGEM + 42.8, y + 7.8);

  const xNota = MARGEM + larguraRecibo;
  doc.rect(xNota, y, larguraNota, altura);
  doc.setFont(FONTE, 'bold');
  doc.setFontSize(8);
  doc.text('NF-e', xNota + 2, y + 4.5);
  doc.setFont(FONTE, 'normal');
  doc.setFontSize(7.5);
  doc.text(numeroNota(nfe.numero), xNota + 2, y + 9);
  doc.text(`SÉRIE ${nfe.serie ?? ''}`, xNota + 2, y + 13);

  // Linha de corte.
  const corte = y + altura + 2;
  doc.setLineDashPattern([1, 1], 0);
  doc.line(MARGEM, corte, MARGEM + W, corte);
  doc.setLineDashPattern([], 0);
  return corte + 2;
}

/** Marca onde vai o "FOLHA x/y", preenchido quando o total é conhecido. */
type MarcaFolha = { pagina: number; x: number; y: number };

/**
 * Cabeçalho: emitente | DANFE | chave de acesso, mais natureza/protocolo e as
 * inscrições do emitente. Repete em toda folha.
 */
function cabecalho(
  doc: jsPDF,
  nfe: NfeDados,
  y: number,
  logo: LogoPdf | null,
  folhas: MarcaFolha[],
) {
  const altura = 33;
  const larguraEmitente = 80;
  const larguraDanfe = 34;
  const larguraChave = W - larguraEmitente - larguraDanfe;

  // ---- Emitente
  doc.setLineWidth(0.15);
  doc.rect(MARGEM, y, larguraEmitente, altura);

  let xTexto = MARGEM + 2;
  let larguraTexto = larguraEmitente - 4;
  if (logo) {
    try {
      const props = doc.getImageProperties(logo.dados);
      const maximo = 26;
      const escala = Math.min(maximo / props.width, maximo / props.height);
      const lw = props.width * escala;
      const lh = props.height * escala;
      doc.addImage(
        logo.dados,
        logo.formato,
        MARGEM + 2 + (maximo - lw) / 2,
        y + 4 + (maximo - lh) / 2,
        lw,
        lh,
      );
      xTexto = MARGEM + 2 + maximo + 2;
      larguraTexto = larguraEmitente - (maximo + 6);
    } catch {
      // Imagem ilegível: o quadro sai só com o texto.
    }
  }

  doc.setFont(FONTE, 'bold');
  doc.setFontSize(7.5);
  doc.text('Identificação do emitente', xTexto, y + 4);
  doc.setFontSize(9);
  const nome = doc.splitTextToSize(
    nfe.emitente.nome ?? '',
    larguraTexto,
  ) as string[];
  doc.text(nome.slice(0, 2), xTexto, y + 8.5);
  const e = nfe.emitente.endereco;
  doc.setFontSize(6.8);
  const linhasEndereco = [
    [e.logradouro, e.numero].filter(Boolean).join(', '),
    [e.complemento].filter(Boolean).join(''),
    [e.bairro, e.cep ? `Cep:${cep(e.cep)}` : ''].filter(Boolean).join(' '),
    [e.municipio, e.uf].filter(Boolean).join('/'),
    e.telefone ? `Fone: ${e.telefone}` : '',
  ].filter(Boolean);
  doc.text(linhasEndereco, xTexto, y + 8.5 + nome.slice(0, 2).length * 3.6, {
    lineHeightFactor: 1.15,
  });

  // ---- DANFE
  const xDanfe = MARGEM + larguraEmitente;
  doc.rect(xDanfe, y, larguraDanfe, altura);
  const centro = xDanfe + larguraDanfe / 2;
  doc.setFont(FONTE, 'bold');
  doc.setFontSize(13);
  doc.text('DANFE', centro, y + 5.5, { align: 'center' });
  doc.setFont(FONTE, 'normal');
  doc.setFontSize(6);
  doc.text('DOCUMENTO AUXILIAR DA', centro, y + 8.5, { align: 'center' });
  doc.text('NOTA FISCAL ELETRÔNICA', centro, y + 11, { align: 'center' });
  doc.text('0-ENTRADA', xDanfe + 3, y + 14.5);
  doc.text('1-SAÍDA', xDanfe + 3, y + 17.5);
  doc.rect(xDanfe + larguraDanfe - 10, y + 12.8, 5, 5);
  doc.setFont(FONTE, 'bold');
  doc.setFontSize(8);
  // tpNF: 0 = entrada, 1 = saída.
  doc.text(
    nfe.tipoOperacao === '0' ? '0' : '1',
    xDanfe + larguraDanfe - 7.5,
    y + 16.5,
    {
      align: 'center',
    },
  );
  doc.setFontSize(8);
  doc.text(numeroNota(nfe.numero), centro, y + 22, { align: 'center' });
  doc.text(`SÉRIE ${nfe.serie ?? ''}`, centro, y + 25.5, { align: 'center' });
  folhas.push({ pagina: doc.getNumberOfPages(), x: centro, y: y + 29 });

  // ---- Chave de acesso
  const xChave = xDanfe + larguraDanfe;
  doc.rect(xChave, y, larguraChave, altura);
  const modulos = code128cModulos(nfe.chave);
  // 44 dígitos em Code128C dão 25 símbolos; um módulo fixo estouraria o
  // quadro em A4, então a largura do módulo se ajusta ao espaço.
  const larguraModulo = Math.min(
    0.33,
    (larguraChave - 6) / (larguraBarras(modulos, 1) || 1),
  );
  const larguraCodigo = larguraBarras(modulos, larguraModulo);
  desenharBarras(doc, modulos, {
    x: xChave + (larguraChave - larguraCodigo) / 2,
    y: y + 2,
    altura: 10,
    larguraModulo,
  });
  doc.line(xChave, y + 13.5, xChave + larguraChave, y + 13.5);
  doc.setFont(FONTE, 'bold');
  doc.setFontSize(7.5);
  doc.text('CHAVE DE ACESSO DA NF-E', xChave + 1.5, y + 16.5);
  doc.setFontSize(8.2);
  doc.text(chaveFormatada(nfe.chave), xChave + 1.5, y + 20);
  doc.line(xChave, y + 22, xChave + larguraChave, y + 22);
  doc.setFont(FONTE, 'normal');
  doc.setFontSize(7.5);
  doc.text(
    [
      'Consulta de autenticidade no portal nacional da NF-e',
      'www.nfe.fazenda.gov.br/portal ou no site da SEFAZ Autorizada',
    ],
    xChave + 1.5,
    y + 26,
  );

  y += altura;

  // ---- Natureza da operação | protocolo
  y = linhaDeCampos(doc, y, [
    {
      largura: larguraEmitente + larguraDanfe,
      rotulo: 'NATUREZA DA OPERAÇÃO',
      valor: nfe.naturezaOperacao ?? '',
    },
    {
      largura: larguraChave,
      rotulo: 'PROTOCOLO DE AUTORIZAÇÃO DE USO',
      valor: nfe.protocolo
        ? `${nfe.protocolo} ${dataBr(nfe.dataProtocolo)} ${horaBr(nfe.dataProtocolo)}`.trim()
        : 'NOTA SEM PROTOCOLO DE AUTORIZAÇÃO NO ARQUIVO XML',
    },
  ]);

  // ---- Inscrições do emitente
  y = linhaDeCampos(doc, y, [
    {
      largura: larguraEmitente,
      rotulo: 'INSCRIÇÃO ESTADUAL',
      valor: nfe.emitente.inscricaoEstadual ?? '',
    },
    {
      largura: larguraDanfe + 30,
      rotulo: 'INSC.ESTADUAL DO SUBST.TRIB.',
      valor: nfe.emitente.inscricaoEstadualSt ?? '',
    },
    {
      largura: larguraChave - 30,
      rotulo: 'CNPJ/CPF',
      valor: documento(nfe.emitente.documento),
    },
  ]);
  return y;
}

function destinatario(doc: jsPDF, nfe: NfeDados, y: number) {
  const d = nfe.destinatario;
  const e = d.endereco;
  const larguraData = 30;
  y = secao(doc, y, 'DESTINATARIO/REMETENTE');
  y = linhaDeCampos(doc, y, [
    {
      largura: W - larguraData - 45,
      rotulo: 'NOME/RAZÃO SOCIAL',
      valor: d.nome ?? '',
    },
    { largura: 45, rotulo: 'CNPJ/CPF', valor: documento(d.documento) },
    {
      largura: larguraData,
      rotulo: 'DATA DE EMISSÃO',
      valor: dataBr(nfe.dataEmissao),
    },
  ]);
  y = linhaDeCampos(doc, y, [
    {
      largura: W - larguraData - 45 - 25,
      rotulo: 'ENDEREÇO',
      valor: [
        [e.logradouro, e.numero].filter(Boolean).join(', '),
        e.complemento,
      ]
        .filter(Boolean)
        .join(' - '),
    },
    { largura: 45, rotulo: 'BAIRRO/DISTRITO', valor: e.bairro ?? '' },
    { largura: 25, rotulo: 'CEP', valor: cep(e.cep) },
    {
      largura: larguraData,
      rotulo: 'DATA ENTRADA/SAÍDA',
      valor: dataBr(nfe.dataSaida),
    },
  ]);
  y = linhaDeCampos(doc, y, [
    {
      largura: W - larguraData - 35 - 12 - 43,
      rotulo: 'MUNICIPIO',
      valor: e.municipio ?? '',
    },
    { largura: 35, rotulo: 'FONE/FAX', valor: e.telefone ?? '' },
    { largura: 12, rotulo: 'UF', valor: e.uf ?? '' },
    {
      largura: 43,
      rotulo: 'INSCRIÇÃO ESTADUAL',
      valor: d.inscricaoEstadual ?? '',
    },
    {
      largura: larguraData,
      rotulo: 'HORA ENTRADA/SAÍDA',
      valor: horaBr(nfe.dataSaida),
    },
  ]);
  return y;
}

/**
 * Fatura: uma faixa de caixas, cada uma com número, vencimento e valor
 * empilhados — como no DANFE do ERP, que desenha a faixa mesmo vazia.
 */
function fatura(doc: jsPDF, nfe: NfeDados, y: number) {
  y = secao(doc, y, 'FATURA');
  const porLinha = 10;
  const largura = W / porLinha;
  const altura = 10;
  const linhas = Math.max(1, Math.ceil(nfe.duplicatas.length / porLinha));
  doc.setLineWidth(0.15);
  for (let l = 0; l < linhas; l++) {
    for (let c = 0; c < porLinha; c++) {
      const x = MARGEM + c * largura;
      const yl = y + l * altura;
      doc.rect(x, yl, largura, altura);
      const dup = nfe.duplicatas[l * porLinha + c];
      if (!dup) continue;
      doc.setFont(FONTE, 'normal');
      doc.setFontSize(6.5);
      doc.text(
        [dup.numero ?? '', dataBr(dup.vencimento), decimal(dup.valor)],
        x + 0.8,
        yl + 2.8,
        { lineHeightFactor: 1.1 },
      );
    }
  }
  return y + linhas * altura;
}

function imposto(doc: jsPDF, nfe: NfeDados, y: number) {
  const t = nfe.totais;
  y = secao(doc, y, 'CALCULO DO IMPOSTO');
  const c5 = W / 5;
  y = linhaDeCampos(doc, y, [
    {
      largura: c5,
      rotulo: 'BASE DE CALCULO DO ICMS',
      valor: decimal(t.baseIcms),
      alinhamento: 'center',
    },
    {
      largura: c5,
      rotulo: 'VALOR DO ICMS',
      valor: decimal(t.valorIcms),
      alinhamento: 'center',
    },
    {
      largura: c5,
      rotulo: 'BASE DE CALCULO DO ICMS SUBSTITUIÇÃO',
      valor: decimal(t.baseIcmsSt),
      alinhamento: 'center',
    },
    {
      largura: c5,
      rotulo: 'VALOR DO ICMS SUBSTITUIÇÃO',
      valor: decimal(t.valorIcmsSt),
      alinhamento: 'center',
    },
    {
      largura: c5,
      rotulo: 'VALOR TOTAL DOS PRODUTOS',
      valor: decimal(t.valorProdutos),
      alinhamento: 'center',
    },
  ]);
  const c6 = W / 6;
  y = linhaDeCampos(doc, y, [
    {
      largura: c6,
      rotulo: 'VALOR DO FRETE',
      valor: decimal(t.valorFrete),
      alinhamento: 'center',
    },
    {
      largura: c6,
      rotulo: 'VALOR DO SEGURO',
      valor: decimal(t.valorSeguro),
      alinhamento: 'center',
    },
    {
      largura: c6,
      rotulo: 'DESCONTO',
      valor: decimal(t.valorDesconto),
      alinhamento: 'center',
    },
    {
      largura: c6,
      rotulo: 'OUTRAS DESPESAS ACESSÓRIAS',
      valor: decimal(t.valorOutros),
      alinhamento: 'center',
    },
    {
      largura: c6,
      rotulo: 'VALOR DO IPI',
      valor: decimal(t.valorIpi),
      alinhamento: 'center',
    },
    {
      largura: c6,
      rotulo: 'VALOR TOTAL DA NOTA',
      valor: decimal(t.valorTotal),
      alinhamento: 'center',
      negrito: true,
    },
  ]);
  return y;
}

function transporte(doc: jsPDF, nfe: NfeDados, y: number) {
  const t = nfe.transporte;
  y = secao(doc, y, 'TRANSPORTADOR/VOLUMES TRANSPORTADOS');
  // Larguras da primeira linha; as de baixo se alinham a elas.
  const frete = 30;
  const antt = 22;
  const placa = 24;
  const uf = 10;
  const doc_ = 36;
  const razao = W - frete - antt - placa - uf - doc_;
  y = linhaDeCampos(doc, y, [
    { largura: razao, rotulo: 'RAZÃO SOCIAL', valor: t.transportador ?? '' },
    {
      largura: frete,
      rotulo: 'FRETE POR CONTA',
      valor: MODALIDADE_FRETE[t.modalidadeFrete ?? ''] ?? '',
    },
    { largura: antt, rotulo: 'CÓDIGO ANTT', valor: t.codigoAntt ?? '' },
    { largura: placa, rotulo: 'PLACA DO VEÍCULO', valor: t.placa ?? '' },
    { largura: uf, rotulo: 'UF', valor: t.placaUf ?? '' },
    {
      largura: doc_,
      rotulo: 'CNPJ/CPF',
      valor: documento(t.documentoTransportador),
    },
  ]);
  y = linhaDeCampos(doc, y, [
    { largura: razao + frete, rotulo: 'ENDEREÇO', valor: t.endereco ?? '' },
    { largura: antt + placa, rotulo: 'MUNICIPIO', valor: t.municipio ?? '' },
    { largura: uf, rotulo: 'UF', valor: t.uf ?? '' },
    {
      largura: doc_,
      rotulo: 'INSCRIÇÃO ESTADUAL',
      valor: t.inscricaoEstadual ?? '',
    },
  ]);
  const c6 = W / 6;
  y = linhaDeCampos(doc, y, [
    {
      largura: c6,
      rotulo: 'QUANTIDADE',
      valor: t.quantidade != null ? decimal(t.quantidade, 0) : '',
    },
    { largura: c6, rotulo: 'ESPECIE', valor: t.especie ?? '' },
    { largura: c6, rotulo: 'MARCA', valor: t.marca ?? '' },
    { largura: c6, rotulo: 'NUMERAÇÃO', valor: t.numeracao ?? '' },
    {
      largura: c6,
      rotulo: 'PESO BRUTO',
      valor: t.pesoBruto != null ? decimal(t.pesoBruto, 3) : '',
    },
    {
      largura: c6,
      rotulo: 'PESO LIQUIDO',
      valor: t.pesoLiquido != null ? decimal(t.pesoLiquido, 3) : '',
    },
  ]);
  return y;
}

// ---------------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------------

type Coluna = {
  rotulo: string;
  largura: number;
  alinhamento: Alinhamento;
  valor: (item: NfeItem) => string;
};

/** Larguras somam a largura útil (196 mm). */
const COLUNAS: Coluna[] = [
  {
    rotulo: 'COD. PROD',
    largura: 18,
    alinhamento: 'left',
    valor: (i) => i.codigo ?? '',
  },
  {
    rotulo: 'DESCRIÇÃO DO PROD./SER.',
    largura: 50,
    alinhamento: 'left',
    valor: (i) => i.descricao ?? '',
  },
  {
    rotulo: 'NCM/SH',
    largura: 13,
    alinhamento: 'left',
    valor: (i) => i.ncm ?? '',
  },
  { rotulo: 'CST', largura: 7, alinhamento: 'left', valor: (i) => i.cst ?? '' },
  {
    rotulo: 'CFOP',
    largura: 8,
    alinhamento: 'left',
    valor: (i) => i.cfop ?? '',
  },
  {
    rotulo: 'UN',
    largura: 7,
    alinhamento: 'left',
    valor: (i) => i.unidade ?? '',
  },
  {
    rotulo: 'QUANT.',
    largura: 13,
    alinhamento: 'right',
    valor: (i) => decimal(i.quantidade, 4),
  },
  {
    rotulo: 'V.UNITARIO',
    largura: 14,
    alinhamento: 'right',
    valor: (i) => decimal(i.valorUnitario, 4),
  },
  {
    rotulo: 'V.TOTAL',
    largura: 13,
    alinhamento: 'right',
    valor: (i) => decimal(i.valorTotal),
  },
  {
    rotulo: 'BC.ICMS',
    largura: 12,
    alinhamento: 'right',
    valor: (i) => decimal(i.baseIcms),
  },
  {
    rotulo: 'V.ICMS',
    largura: 11,
    alinhamento: 'right',
    valor: (i) => decimal(i.valorIcms),
  },
  {
    rotulo: 'V.IPI',
    largura: 10,
    alinhamento: 'right',
    valor: (i) => decimal(i.valorIpi),
  },
  {
    rotulo: 'A.ICMS',
    largura: 10,
    alinhamento: 'right',
    valor: (i) => percentual(i.aliquotaIcms),
  },
  {
    rotulo: 'A.IPI',
    largura: 10,
    alinhamento: 'right',
    valor: (i) => percentual(i.aliquotaIpi),
  },
];

const ALTURA_LINHA_ITEM = 2.7;

/** Quadro dos itens: cabeçalho e as linhas verticais até o fim do quadro. */
function quadroItens(doc: jsPDF, y: number, fundo: number) {
  doc.setLineWidth(0.15);
  doc.rect(MARGEM, y, W, fundo - y);
  doc.line(MARGEM, y + 5, MARGEM + W, y + 5);
  doc.setFont(FONTE, 'bold');
  doc.setFontSize(5.2);
  let x = MARGEM;
  COLUNAS.forEach((c, i) => {
    if (i > 0) doc.line(x, y, x, fundo);
    doc.text(c.rotulo, x + 0.6, y + 3.3, { maxWidth: c.largura - 1 });
    x += c.largura;
  });
  return y + 5;
}

/**
 * Escreve os itens a partir de `inicio` dentro do quadro e devolve quantos
 * couberam. A descrição quebra linha; as outras colunas ficam na primeira.
 */
function escreverItens(
  doc: jsPDF,
  itens: NfeItem[],
  inicio: number,
  y: number,
  fundo: number,
) {
  let i = inicio;
  y += 0.6;
  doc.setFont(FONTE, 'normal');
  doc.setFontSize(6.5);
  for (; i < itens.length; i++) {
    const item = itens[i];
    const descricao = doc.splitTextToSize(
      COLUNAS[1].valor(item),
      COLUNAS[1].largura - 2,
    ) as string[];
    const altura = descricao.length * ALTURA_LINHA_ITEM + 1.2;
    if (y + altura > fundo) break;

    let x = MARGEM;
    COLUNAS.forEach((c, n) => {
      const texto = n === 1 ? descricao : c.valor(item);
      const posX = c.alinhamento === 'right' ? x + c.largura - 0.6 : x + 0.6;
      doc.text(texto, posX, y + 2.2, {
        align: c.alinhamento,
        lineHeightFactor: 1.15,
      });
      x += c.largura;
    });
    y += altura;
    // Separador tracejado entre itens, como no DANFE do ERP.
    doc.setLineDashPattern([0.8, 0.8], 0);
    doc.line(MARGEM, y, MARGEM + W, y);
    doc.setLineDashPattern([], 0);
  }
  return i;
}

// ---------------------------------------------------------------------------
// Rodapé
// ---------------------------------------------------------------------------

const ALTURA_ADICIONAIS = 34;
/** ISSQN (título + quadro) e dados adicionais (título + quadro). */
const ALTURA_RODAPE = 3 + H + 3 + ALTURA_ADICIONAIS;

function rodape(doc: jsPDF, nfe: NfeDados, y: number, opcoes: DanfePdfOpcoes) {
  y = secao(doc, y, 'CALCULO DO ISSQN');
  const c4 = W / 4;
  y = linhaDeCampos(doc, y, [
    {
      largura: c4,
      rotulo: 'INSCRIÇÃO MUNICIPAL',
      valor: nfe.emitente.inscricaoMunicipal ?? '',
    },
    {
      largura: c4,
      rotulo: 'VALOR TOTAL DOS SERVIÇOS',
      valor:
        nfe.issqn.valorServicos != null ? decimal(nfe.issqn.valorServicos) : '',
      alinhamento: 'right',
    },
    {
      largura: c4,
      rotulo: 'BASE DE CÁLCULO DO ISSQN',
      valor: nfe.issqn.base != null ? decimal(nfe.issqn.base) : '',
      alinhamento: 'right',
    },
    {
      largura: c4,
      rotulo: 'VALOR DO ISSQN',
      valor: nfe.issqn.valor != null ? decimal(nfe.issqn.valor) : '',
      alinhamento: 'right',
    },
  ]);

  y = secao(doc, y, 'DADOS ADICIONAIS');
  const larguraInfo = 120;
  campoMultilinha(
    doc,
    MARGEM,
    y,
    larguraInfo,
    ALTURA_ADICIONAIS,
    'INFORMAÇÕES COMPLEMENTARES',
    [
      nfe.informacoesComplementares ?? '',
      nfe.protocolo ? `Protocolo: ${nfe.protocolo}` : '',
      opcoes.segundaVia ? 'DOCUMENTO REIMPRESSO (2ª VIA).' : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );
  campoMultilinha(
    doc,
    MARGEM + larguraInfo,
    y,
    W - larguraInfo,
    ALTURA_ADICIONAIS,
    'RESERVADO AO FISCO',
    nfe.informacoesFisco ?? '',
  );
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

export type DanfePdfOpcoes = {
  /** Marca o papel como reimpressão — é sempre 2ª via quando sai daqui. */
  segundaVia?: boolean;
  /** Logo do emitente, no quadro de identificação. */
  logo?: LogoPdf | null;
};

/** Monta o DANFE e devolve os bytes do PDF. */
export function montarDanfePdf(
  nfe: NfeDados,
  opcoes: DanfePdfOpcoes = {},
): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = opcoes.logo ?? null;
  const folhas: MarcaFolha[] = [];
  const fundoPagina = ALTURA_PAGINA - MARGEM;

  // ---- Primeira folha: tudo, com os itens entre o transporte e o rodapé.
  let y = canhoto(doc, nfe, MARGEM);
  y = cabecalho(doc, nfe, y, logo, folhas);
  y = destinatario(doc, nfe, y);
  y = fatura(doc, nfe, y);
  y = imposto(doc, nfe, y);
  y = transporte(doc, nfe, y);
  y = secao(doc, y, 'DADOS DO PRODUTO / SERVIÇO');

  const fundoItens = fundoPagina - ALTURA_RODAPE;
  let proximo = escreverItens(
    doc,
    nfe.itens,
    0,
    quadroItens(doc, y, fundoItens),
    fundoItens,
  );
  rodape(doc, nfe, fundoItens, opcoes);

  // ---- Folhas seguintes: cabeçalho e o resto dos itens até o pé da página.
  while (proximo < nfe.itens.length) {
    doc.addPage();
    let yc = cabecalho(doc, nfe, MARGEM, logo, folhas);
    yc = secao(doc, yc, 'DADOS DO PRODUTO / SERVIÇO');
    const antes = proximo;
    proximo = escreverItens(
      doc,
      nfe.itens,
      proximo,
      quadroItens(doc, yc, fundoPagina),
      fundoPagina,
    );
    if (proximo === antes) break; // item que não cabe nem numa folha vazia
  }

  // ---- FOLHA x/y, agora que o total é conhecido.
  const total = doc.getNumberOfPages();
  const doisDigitos = (n: number) => String(n).padStart(2, '0');
  for (const f of folhas) {
    doc.setPage(f.pagina);
    doc.setFont(FONTE, 'bold');
    doc.setFontSize(8);
    doc.text(`FOLHA ${doisDigitos(f.pagina)}/${doisDigitos(total)}`, f.x, f.y, {
      align: 'center',
    });
  }

  // Carimbos vão por último, em todas as páginas, para ficarem por cima.
  const marca = nfe.cancelada
    ? 'NF-e CANCELADA'
    : !nfe.protocolo
      ? 'SEM VALOR FISCAL'
      : null;
  if (marca) {
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      carimbo(doc, marca);
    }
  }

  return Buffer.from(doc.output('arraybuffer'));
}
