/**
 * XML de NF-e para a base de demonstração.
 *
 * A 2ª via do DANFE **não** é um PDF guardado: ela é renderizada na hora, a
 * partir do XML autorizado que o ERP enviou (`nota_saida_xml`). Sem XML, a
 * tela responde "sem XML guardado" e o botão não faz nada — então uma base de
 * demonstração sem isto não demonstra a 2ª via, que é justamente uma das
 * funções que o vendedor mais usa.
 *
 * O XML aqui é fictício, mas **estruturalmente real**: passa pelo mesmo
 * `extrairNfe` da rota de download, com chave de 44 dígitos (DV calculado pelo
 * módulo 11 de verdade), `ide`, `emit`, `dest`, um `det` por item, `ICMSTot`,
 * `cobr` com as duplicatas e o `infProt` da autorização.
 */

export interface EmitenteNfe {
  cnpj: string;
  razaoSocial: string;
  fantasia: string;
  endereco: string;
  numero: string;
  bairro: string;
  municipio: string;
  codigoMunicipio: string;
  uf: string;
  cep: string;
  inscricaoEstadual: string;
  fone: string;
}

export interface DestinatarioNfe {
  cnpj: string;
  razaoSocial: string;
  endereco: string;
  numero: string;
  bairro: string;
  municipio: string;
  codigoMunicipio: string;
  uf: string;
  cep: string;
  inscricaoEstadual: string | null;
  fone: string | null;
}

export interface ItemNfe {
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
}

export interface DuplicataNfe {
  numero: string;
  vencimento: Date;
  valor: number;
}

export interface NfeParaXml {
  chave?: string;
  numero: string;
  serie: string;
  emissao: Date;
  naturezaOperacao: string;
  emitente: EmitenteNfe;
  destinatario: DestinatarioNfe;
  itens: ItemNfe[];
  duplicatas: DuplicataNfe[];
  transportadora?: string;
  protocolo: string;
}

const so = (v: string) => v.replace(/\D/g, '');
const dinheiro = (v: number) => v.toFixed(2);
const quantidade = (v: number) => v.toFixed(4);

/** Escapa o que vai como texto de elemento — razão social com "&" existe. */
const xml = (v: string) =>
  v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** `2026-09-02T14:30:00-04:00` — o fuso de MS, que é o da empresa. */
function dataHoraNfe(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}-04:00`
  );
}

/**
 * Dígito verificador da chave de acesso — módulo 11, pesos 2 a 9 da direita
 * para a esquerda. É o mesmo cálculo da SEFAZ: uma chave com DV errado é
 * rejeitada por qualquer validador, e a ideia aqui é ter dado que sobrevive a
 * um teste de verdade.
 */
function digitoChave(base43: string): string {
  let peso = 2;
  let soma = 0;
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  return dv >= 10 ? '0' : String(dv);
}

/**
 * Chave de acesso: UF + AAMM + CNPJ + modelo + série + número + tpEmis +
 * código numérico + DV. 44 dígitos, na ordem que o layout manda.
 */
export function montarChaveNfe(n: {
  uf: string;
  emissao: Date;
  cnpjEmitente: string;
  serie: string;
  numero: string;
  codigoNumerico: string;
}): string {
  const uf = '50'; // MS
  const aamm =
    String(n.emissao.getFullYear()).slice(2) +
    String(n.emissao.getMonth() + 1).padStart(2, '0');
  const base =
    uf +
    aamm +
    so(n.cnpjEmitente).padStart(14, '0') +
    '55' +
    n.serie.padStart(3, '0') +
    n.numero.padStart(9, '0') +
    '1' +
    n.codigoNumerico.padStart(8, '0');
  return base + digitoChave(base);
}

export function montarXmlNfe(n: NfeParaXml): string {
  const chave =
    n.chave ??
    montarChaveNfe({
      uf: n.emitente.uf,
      emissao: n.emissao,
      cnpjEmitente: n.emitente.cnpj,
      serie: n.serie,
      numero: n.numero,
      codigoNumerico: n.numero.padStart(8, '0'),
    });

  const totalProdutos = n.itens.reduce((s, i) => s + i.valorTotal, 0);
  // Tributos plausíveis para dentro do estado: ICMS 17%, sem IPI. Os valores
  // não precisam fechar com a apuração real — precisam existir e ser
  // coerentes entre si, que é o que o DANFE imprime.
  const baseIcms = totalProdutos;
  const valorIcms = Math.round(totalProdutos * 0.17 * 100) / 100;

  const itensXml = n.itens
    .map(
      (item, i) => `
    <det nItem="${i + 1}">
      <prod>
        <cProd>${xml(item.codigo)}</cProd>
        <cEAN>SEM GTIN</cEAN>
        <xProd>${xml(item.descricao)}</xProd>
        <NCM>${item.ncm}</NCM>
        <CFOP>${item.cfop}</CFOP>
        <uCom>${xml(item.unidade)}</uCom>
        <qCom>${quantidade(item.quantidade)}</qCom>
        <vUnCom>${item.valorUnitario.toFixed(4)}</vUnCom>
        <vProd>${dinheiro(item.valorTotal)}</vProd>
        <cEANTrib>SEM GTIN</cEANTrib>
        <uTrib>${xml(item.unidade)}</uTrib>
        <qTrib>${quantidade(item.quantidade)}</qTrib>
        <vUnTrib>${item.valorUnitario.toFixed(4)}</vUnTrib>
        <indTot>1</indTot>
      </prod>
      <imposto>
        <ICMS>
          <ICMS00>
            <orig>0</orig>
            <CST>00</CST>
            <modBC>3</modBC>
            <vBC>${dinheiro(item.valorTotal)}</vBC>
            <pICMS>17.00</pICMS>
            <vICMS>${dinheiro(Math.round(item.valorTotal * 0.17 * 100) / 100)}</vICMS>
          </ICMS00>
        </ICMS>
        <PIS>
          <PISAliq>
            <CST>01</CST>
            <vBC>${dinheiro(item.valorTotal)}</vBC>
            <pPIS>1.65</pPIS>
            <vPIS>${dinheiro(Math.round(item.valorTotal * 0.0165 * 100) / 100)}</vPIS>
          </PISAliq>
        </PIS>
        <COFINS>
          <COFINSAliq>
            <CST>01</CST>
            <vBC>${dinheiro(item.valorTotal)}</vBC>
            <pCOFINS>7.60</pCOFINS>
            <vCOFINS>${dinheiro(Math.round(item.valorTotal * 0.076 * 100) / 100)}</vCOFINS>
          </COFINSAliq>
        </COFINS>
      </imposto>
    </det>`,
    )
    .join('');

  const duplicatasXml = n.duplicatas
    .map(
      (d) => `
        <dup>
          <nDup>${xml(d.numero)}</nDup>
          <dVenc>${d.vencimento.toISOString().slice(0, 10)}</dVenc>
          <vDup>${dinheiro(d.valor)}</vDup>
        </dup>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe versao="4.00" Id="NFe${chave}">
      <ide>
        <cUF>50</cUF>
        <cNF>${n.numero.padStart(8, '0')}</cNF>
        <natOp>${xml(n.naturezaOperacao)}</natOp>
        <mod>55</mod>
        <serie>${n.serie}</serie>
        <nNF>${n.numero}</nNF>
        <dhEmi>${dataHoraNfe(n.emissao)}</dhEmi>
        <dhSaiEnt>${dataHoraNfe(n.emissao)}</dhSaiEnt>
        <tpNF>1</tpNF>
        <idDest>1</idDest>
        <cMunFG>${n.emitente.codigoMunicipio}</cMunFG>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <cDV>${chave.slice(-1)}</cDV>
        <tpAmb>1</tpAmb>
        <finNFe>1</finNFe>
        <indFinal>0</indFinal>
        <indPres>1</indPres>
        <procEmi>0</procEmi>
        <verProc>DEMO-1.0</verProc>
      </ide>
      <emit>
        <CNPJ>${so(n.emitente.cnpj)}</CNPJ>
        <xNome>${xml(n.emitente.razaoSocial)}</xNome>
        <xFant>${xml(n.emitente.fantasia)}</xFant>
        <enderEmit>
          <xLgr>${xml(n.emitente.endereco)}</xLgr>
          <nro>${xml(n.emitente.numero)}</nro>
          <xBairro>${xml(n.emitente.bairro)}</xBairro>
          <cMun>${n.emitente.codigoMunicipio}</cMun>
          <xMun>${xml(n.emitente.municipio)}</xMun>
          <UF>${n.emitente.uf}</UF>
          <CEP>${so(n.emitente.cep)}</CEP>
          <cPais>1058</cPais>
          <xPais>BRASIL</xPais>
          <fone>${so(n.emitente.fone)}</fone>
        </enderEmit>
        <IE>${n.emitente.inscricaoEstadual}</IE>
        <CRT>3</CRT>
      </emit>
      <dest>
        <CNPJ>${so(n.destinatario.cnpj)}</CNPJ>
        <xNome>${xml(n.destinatario.razaoSocial)}</xNome>
        <enderDest>
          <xLgr>${xml(n.destinatario.endereco)}</xLgr>
          <nro>${xml(n.destinatario.numero)}</nro>
          <xBairro>${xml(n.destinatario.bairro)}</xBairro>
          <cMun>${n.destinatario.codigoMunicipio}</cMun>
          <xMun>${xml(n.destinatario.municipio)}</xMun>
          <UF>${n.destinatario.uf}</UF>
          <CEP>${so(n.destinatario.cep)}</CEP>
          <cPais>1058</cPais>
          <xPais>BRASIL</xPais>${
            n.destinatario.fone
              ? `\n          <fone>${so(n.destinatario.fone)}</fone>`
              : ''
          }
        </enderDest>
        <indIEDest>${n.destinatario.inscricaoEstadual ? '1' : '9'}</indIEDest>${
          n.destinatario.inscricaoEstadual
            ? `\n        <IE>${n.destinatario.inscricaoEstadual}</IE>`
            : ''
        }
      </dest>${itensXml}
      <total>
        <ICMSTot>
          <vBC>${dinheiro(baseIcms)}</vBC>
          <vICMS>${dinheiro(valorIcms)}</vICMS>
          <vICMSDeson>0.00</vICMSDeson>
          <vFCP>0.00</vFCP>
          <vBCST>0.00</vBCST>
          <vST>0.00</vST>
          <vProd>${dinheiro(totalProdutos)}</vProd>
          <vFrete>0.00</vFrete>
          <vSeg>0.00</vSeg>
          <vDesc>0.00</vDesc>
          <vII>0.00</vII>
          <vIPI>0.00</vIPI>
          <vPIS>${dinheiro(Math.round(totalProdutos * 0.0165 * 100) / 100)}</vPIS>
          <vCOFINS>${dinheiro(Math.round(totalProdutos * 0.076 * 100) / 100)}</vCOFINS>
          <vOutro>0.00</vOutro>
          <vNF>${dinheiro(totalProdutos)}</vNF>
        </ICMSTot>
      </total>
      <transp>
        <modFrete>${n.transportadora ? '1' : '9'}</modFrete>${
          n.transportadora
            ? `
        <transporta>
          <xNome>${xml(n.transportadora)}</xNome>
          <xMun>${xml(n.destinatario.municipio)}</xMun>
          <UF>${n.destinatario.uf}</UF>
        </transporta>
        <vol>
          <qVol>${n.itens.length}</qVol>
          <esp>CAIXA</esp>
          <pesoL>${(n.itens.length * 3.4).toFixed(3)}</pesoL>
          <pesoB>${(n.itens.length * 3.6).toFixed(3)}</pesoB>
        </vol>`
            : ''
        }
      </transp>
      <cobr>
        <fat>
          <nFat>${n.numero}</nFat>
          <vOrig>${dinheiro(totalProdutos)}</vOrig>
          <vDesc>0.00</vDesc>
          <vLiq>${dinheiro(totalProdutos)}</vLiq>
        </fat>${duplicatasXml}
      </cobr>
      <infAdic>
        <infCpl>Documento gerado para demonstracao do sistema. Sem valor fiscal.</infCpl>
      </infAdic>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <tpAmb>1</tpAmb>
      <verAplic>SVRS-DEMO</verAplic>
      <chNFe>${chave}</chNFe>
      <dhRecbto>${dataHoraNfe(n.emissao)}</dhRecbto>
      <nProt>${n.protocolo}</nProt>
      <digVal>ZGVtb25zdHJhY2FvZGlnZXN0dmFsdWU=</digVal>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso da NF-e</xMotivo>
    </infProt>
  </protNFe>
</nfeProc>`;
}
