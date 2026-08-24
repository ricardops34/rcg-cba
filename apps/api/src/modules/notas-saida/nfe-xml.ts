/**
 * Leitura do XML autorizado da NF-e.
 *
 * Parser próprio, e não uma dependência nova, porque o que se precisa aqui é
 * estreito e estável: ler elementos e atributos de um documento que a SEFAZ
 * já validou contra o schema. Não há entidade externa, DTD nem namespace
 * dinâmico para resolver — e trazer um parser genérico para o backend só para
 * isso significaria também trazer a superfície de XXE que ele carrega.
 *
 * Duas garantias importantes de segurança, já que o arquivo vem de fora:
 *
 * - **Nada é resolvido.** DOCTYPE, ENTITY e instruções de processamento são
 *   descartados no pré-processo — sem resolução de entidade não há XXE nem
 *   billion laughs.
 * - **Profundidade limitada**, para que um XML forjado não estoure a pilha.
 */

export class NfeXmlInvalidoError extends Error {}

/**
 * Teto do XML aceito na ingestão. Uma NF-e de 990 itens (o máximo do layout)
 * não passa de ~2 MB; o dobro disso é folga contra XML formatado com indentação
 * generosa, e barra payload que só engordaria a tabela.
 */
export const NFE_XML_MAX_BYTES = 5 * 1024 * 1024;

export type NoXml = {
  nome: string;
  atributos: Record<string, string>;
  filhos: NoXml[];
  texto: string;
};

const PROFUNDIDADE_MAXIMA = 60;

/** Desfaz as cinco entidades previstas no XML (as únicas que a NF-e usa). */
function decodificar(texto: string): string {
  return texto
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');
}

/**
 * Monta a árvore do documento.
 *
 * Tags são varridas por expressão regular em vez de caractere a caractere: o
 * documento já é válido (veio autorizado), e o que sobra é reconhecer
 * abertura, fechamento e tag vazia.
 */
export function lerXml(conteudo: string): NoXml {
  const limpo = conteudo
    // Ordem importa: CDATA primeiro vira texto puro, senão o `<` de dentro
    // dele seria confundido com uma tag.
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, dados: string) =>
      dados.replace(/[<>&]/g, (c) =>
        c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;',
      ),
    )
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<\?[\s\S]*?\?>/g, '');

  const raiz: NoXml = { nome: '#raiz', atributos: {}, filhos: [], texto: '' };
  const pilha: NoXml[] = [raiz];

  const tags = /<\s*(\/?)\s*([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)\s*(\/?)\s*>/g;
  let ultimoFim = 0;
  let tag: RegExpExecArray | null;

  while ((tag = tags.exec(limpo)) !== null) {
    const [bruta, fechamento, nome, atributosBrutos, vazia] = tag;
    const atual = pilha[pilha.length - 1];

    // O que veio antes desta tag é texto do elemento aberto.
    const texto = limpo.slice(ultimoFim, tag.index).trim();
    if (texto) atual.texto += decodificar(texto);
    ultimoFim = tag.index + bruta.length;

    if (fechamento) {
      if (pilha.length > 1) pilha.pop();
      continue;
    }

    const atributos: Record<string, string> = {};
    const atrRegex = /([\w.:-]+)\s*=\s*"([^"]*)"/g;
    let atr: RegExpExecArray | null;
    while ((atr = atrRegex.exec(atributosBrutos)) !== null) {
      atributos[atr[1]] = decodificar(atr[2]);
    }

    // Namespace não muda o significado do elemento na NF-e (só existe o da
    // portaria e o da assinatura), então o prefixo é descartado — assim
    // `ns:infNFe` e `infNFe` são o mesmo caminho para quem consulta.
    const no: NoXml = {
      nome: nome.includes(':') ? nome.slice(nome.indexOf(':') + 1) : nome,
      atributos,
      filhos: [],
      texto: '',
    };
    atual.filhos.push(no);

    if (!vazia) {
      if (pilha.length >= PROFUNDIDADE_MAXIMA) {
        throw new NfeXmlInvalidoError('XML com aninhamento acima do esperado.');
      }
      pilha.push(no);
    }
  }

  return raiz;
}

/** Primeiro filho com esse nome, em qualquer profundidade abaixo do nó. */
export function buscar(no: NoXml | null, nome: string): NoXml | null {
  if (!no) return null;
  for (const filho of no.filhos) {
    if (filho.nome === nome) return filho;
    const achado = buscar(filho, nome);
    if (achado) return achado;
  }
  return null;
}

/** Todos os filhos diretos com esse nome. */
export function filhos(no: NoXml | null, nome: string): NoXml[] {
  return no ? no.filhos.filter((f) => f.nome === nome) : [];
}

/** Texto de um caminho relativo (`ide/nNF`), ou null se qualquer nível faltar. */
export function texto(no: NoXml | null, caminho: string): string | null {
  let atual: NoXml | null = no;
  for (const parte of caminho.split('/')) {
    if (!atual) return null;
    atual = atual.filhos.find((f) => f.nome === parte) ?? null;
  }
  const valor = atual?.texto.trim();
  return valor ? valor : null;
}

/** Como `texto`, convertido para número (o XML da NF-e usa ponto decimal). */
export function numero(no: NoXml | null, caminho: string): number | null {
  const valor = texto(no, caminho);
  if (valor == null) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export type NfeItem = {
  numeroItem: string | null;
  codigo: string | null;
  descricao: string | null;
  ncm: string | null;
  cst: string | null;
  cfop: string | null;
  unidade: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
  baseIcms: number | null;
  valorIcms: number | null;
  valorIpi: number | null;
  aliquotaIcms: number | null;
  aliquotaIpi: number | null;
};

export type NfeDuplicata = {
  numero: string | null;
  vencimento: string | null;
  valor: number | null;
};

export type NfeEndereco = {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  telefone: string | null;
};

export type NfeParte = {
  nome: string | null;
  fantasia: string | null;
  documento: string | null;
  inscricaoEstadual: string | null;
  endereco: NfeEndereco;
};

/** O que o DANFE precisa do XML — nem mais, nem menos. */
export type NfeDados = {
  chave: string;
  numero: string | null;
  serie: string | null;
  modelo: string | null;
  naturezaOperacao: string | null;
  dataEmissao: string | null;
  dataSaida: string | null;
  tipoOperacao: string | null;
  protocolo: string | null;
  dataProtocolo: string | null;
  cancelada: boolean;
  emitente: NfeParte;
  destinatario: NfeParte;
  itens: NfeItem[];
  duplicatas: NfeDuplicata[];
  totais: {
    baseIcms: number | null;
    valorIcms: number | null;
    baseIcmsSt: number | null;
    valorIcmsSt: number | null;
    valorProdutos: number | null;
    valorFrete: number | null;
    valorSeguro: number | null;
    valorDesconto: number | null;
    valorOutros: number | null;
    valorIpi: number | null;
    valorTotal: number | null;
  };
  transporte: {
    modalidadeFrete: string | null;
    transportador: string | null;
    documentoTransportador: string | null;
    municipio: string | null;
    uf: string | null;
    placa: string | null;
    quantidade: number | null;
    especie: string | null;
    marca: string | null;
    pesoBruto: number | null;
    pesoLiquido: number | null;
  };
  informacoesComplementares: string | null;
};

function lerEndereco(no: NoXml | null): NfeEndereco {
  return {
    logradouro: texto(no, 'xLgr'),
    numero: texto(no, 'nro'),
    complemento: texto(no, 'xCpl'),
    bairro: texto(no, 'xBairro'),
    municipio: texto(no, 'xMun'),
    uf: texto(no, 'UF'),
    cep: texto(no, 'CEP'),
    telefone: texto(no, 'fone'),
  };
}

function lerParte(no: NoXml | null, tagEndereco: string): NfeParte {
  return {
    nome: texto(no, 'xNome'),
    fantasia: texto(no, 'xFant'),
    // Emitente é sempre CNPJ; destinatário pode ser CPF (venda a pessoa
    // física) ou nem ter documento (exportação).
    documento: texto(no, 'CNPJ') ?? texto(no, 'CPF'),
    inscricaoEstadual: texto(no, 'IE'),
    endereco: lerEndereco(buscar(no, tagEndereco)),
  };
}

/**
 * Extrai do XML tudo o que o DANFE imprime.
 *
 * Aceita tanto o `nfeProc` (nota + protocolo de autorização, que é o que o
 * ERP deve mandar) quanto a `NFe` sozinha. Sem `nfeProc` a nota não tem
 * protocolo: o DANFE sai marcado como sem autorização, porque imprimir um
 * documento fiscal que não passou pela SEFAZ como se tivesse passado é o tipo
 * de erro que ninguém percebe até a fiscalização.
 */
export function extrairNfe(conteudo: string): NfeDados {
  const raiz = lerXml(conteudo);
  const infNFe = buscar(raiz, 'infNFe');
  if (!infNFe) {
    throw new NfeXmlInvalidoError(
      'XML não é uma NF-e: elemento infNFe não encontrado.',
    );
  }

  // O Id vem como "NFe" + 44 dígitos.
  const chave = (infNFe.atributos.Id ?? '').replace(/\D/g, '');
  if (chave.length !== 44) {
    throw new NfeXmlInvalidoError(
      'XML sem chave de acesso válida (infNFe/@Id com 44 dígitos).',
    );
  }

  const ide = buscar(infNFe, 'ide');
  const infProt = buscar(raiz, 'infProt');
  const total = buscar(infNFe, 'ICMSTot');
  const transp = buscar(infNFe, 'transp');
  const transporta = buscar(transp, 'transporta');
  const veiculo = buscar(transp, 'veicTransp');
  const volume = buscar(transp, 'vol');
  const cobr = buscar(infNFe, 'cobr');

  const itens = filhos(infNFe, 'det').map((det): NfeItem => {
    const prod = buscar(det, 'prod');
    const icms = buscar(det, 'ICMS');
    // O grupo do ICMS varia com a tributação (ICMS00, ICMS20, ICMSSN102...);
    // o que interessa está no primeiro filho, qualquer que seja o nome.
    const icmsGrupo = icms?.filhos[0] ?? null;
    const ipi = buscar(det, 'IPITrib');

    return {
      numeroItem: det.atributos.nItem ?? null,
      codigo: texto(prod, 'cProd'),
      descricao: texto(prod, 'xProd'),
      ncm: texto(prod, 'NCM'),
      cst:
        (texto(icmsGrupo, 'orig') ?? '') +
          (texto(icmsGrupo, 'CST') ?? texto(icmsGrupo, 'CSOSN') ?? '') || null,
      cfop: texto(prod, 'CFOP'),
      unidade: texto(prod, 'uCom'),
      quantidade: numero(prod, 'qCom'),
      valorUnitario: numero(prod, 'vUnCom'),
      valorTotal: numero(prod, 'vProd'),
      baseIcms: numero(icmsGrupo, 'vBC'),
      valorIcms: numero(icmsGrupo, 'vICMS'),
      valorIpi: numero(ipi, 'vIPI'),
      aliquotaIcms: numero(icmsGrupo, 'pICMS'),
      aliquotaIpi: numero(ipi, 'pIPI'),
    };
  });

  const duplicatas = filhos(cobr, 'dup').map(
    (dup): NfeDuplicata => ({
      numero: texto(dup, 'nDup'),
      vencimento: texto(dup, 'dVenc'),
      valor: numero(dup, 'vDup'),
    }),
  );

  // cStat 101/151/135 são os status de cancelamento homologado. Quando o ERP
  // manda o XML de cancelamento junto, o DANFE precisa sair marcado.
  const statusProtocolo = texto(infProt, 'cStat');
  const cancelada = ['101', '135', '151', '155'].includes(statusProtocolo ?? '');

  return {
    chave,
    numero: texto(ide, 'nNF'),
    serie: texto(ide, 'serie'),
    modelo: texto(ide, 'mod'),
    naturezaOperacao: texto(ide, 'natOp'),
    dataEmissao: texto(ide, 'dhEmi') ?? texto(ide, 'dEmi'),
    dataSaida: texto(ide, 'dhSaiEnt') ?? texto(ide, 'dSaiEnt'),
    tipoOperacao: texto(ide, 'tpNF'),
    protocolo: texto(infProt, 'nProt'),
    dataProtocolo: texto(infProt, 'dhRecbto'),
    cancelada,
    emitente: lerParte(buscar(infNFe, 'emit'), 'enderEmit'),
    destinatario: lerParte(buscar(infNFe, 'dest'), 'enderDest'),
    itens,
    duplicatas,
    totais: {
      baseIcms: numero(total, 'vBC'),
      valorIcms: numero(total, 'vICMS'),
      baseIcmsSt: numero(total, 'vBCST'),
      valorIcmsSt: numero(total, 'vST'),
      valorProdutos: numero(total, 'vProd'),
      valorFrete: numero(total, 'vFrete'),
      valorSeguro: numero(total, 'vSeg'),
      valorDesconto: numero(total, 'vDesc'),
      valorOutros: numero(total, 'vOutro'),
      valorIpi: numero(total, 'vIPI'),
      valorTotal: numero(total, 'vNF'),
    },
    transporte: {
      modalidadeFrete: texto(transp, 'modFrete'),
      transportador: texto(transporta, 'xNome'),
      documentoTransportador:
        texto(transporta, 'CNPJ') ?? texto(transporta, 'CPF'),
      municipio: texto(transporta, 'xMunFG'),
      uf: texto(transporta, 'UF'),
      placa: texto(veiculo, 'placa'),
      quantidade: numero(volume, 'qVol'),
      especie: texto(volume, 'esp'),
      marca: texto(volume, 'marca'),
      pesoBruto: numero(volume, 'pesoB'),
      pesoLiquido: numero(volume, 'pesoL'),
    },
    informacoesComplementares: texto(buscar(infNFe, 'infAdic'), 'infCpl'),
  };
}
