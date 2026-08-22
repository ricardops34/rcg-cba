import { extrairNfe, lerXml, NfeXmlInvalidoError } from './nfe-xml';

/**
 * NF-e reduzida, mas com as armadilhas reais do arquivo que o ERP manda:
 * namespace, `nfeProc` envolvendo nota e protocolo, entidade (`&amp;`),
 * CDATA com `<` dentro, e dois itens com grupos de ICMS diferentes (ICMS00 e
 * ICMSSN102) — o segundo é o que quebra parser que assume nome fixo.
 */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
<NFe><infNFe Id="NFe50260600000000000191550010001160671000116060" versao="4.00">
<ide><nNF>116067</nNF><serie>1</serie><mod>55</mod><natOp>VENDA DE MERCADORIA</natOp><dhEmi>2026-06-30T10:15:00-04:00</dhEmi><tpNF>1</tpNF></ide>
<emit><CNPJ>00000000000191</CNPJ><xNome>RCG COMERCIO LTDA</xNome>
<enderEmit><xLgr>AV BRASIL</xLgr><nro>1500</nro><xMun>CAMPO GRANDE</xMun><UF>MS</UF></enderEmit><IE>123456789</IE></emit>
<dest><CNPJ>11222333000181</CNPJ><xNome>MERCADO DO JOAO LTDA</xNome>
<enderDest><xLgr>RUA DAS FLORES</xLgr><xMun>DOURADOS</xMun><UF>MS</UF></enderDest></dest>
<det nItem="1"><prod><cProd>P-1</cProd><xProd>PARAFUSO 3/8 &amp; PORCA</xProd><NCM>73181500</NCM><CFOP>5102</CFOP><uCom>PC</uCom><qCom>100.0000</qCom><vUnCom>2.5000</vUnCom><vProd>250.00</vProd></prod>
<imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><vBC>250.00</vBC><pICMS>17.00</pICMS><vICMS>42.50</vICMS></ICMS00></ICMS><IPI><IPITrib><pIPI>5.00</pIPI><vIPI>12.50</vIPI></IPITrib></IPI></imposto></det>
<det nItem="2"><prod><cProd>P-2</cProd><xProd><![CDATA[ARRUELA <LISA> 3/8]]></xProd><NCM>73182200</NCM><CFOP>5102</CFOP><uCom>PC</uCom><qCom>50.0000</qCom><vUnCom>0.8000</vUnCom><vProd>40.00</vProd></prod>
<imposto><ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS></imposto></det>
<total><ICMSTot><vBC>250.00</vBC><vICMS>42.50</vICMS><vProd>290.00</vProd><vFrete>10.00</vFrete><vIPI>12.50</vIPI><vNF>312.50</vNF></ICMSTot></total>
<transp><modFrete>0</modFrete><transporta><xNome>TRANSPORTES XYZ</xNome><CNPJ>99888777000166</CNPJ><UF>MS</UF></transporta><vol><qVol>2</qVol><esp>CX</esp><pesoB>15.500</pesoB></vol></transp>
<cobr><dup><nDup>001</nDup><dVenc>2026-07-28</dVenc><vDup>312.50</vDup></dup></cobr>
<infAdic><infCpl>Pedido 4455.</infCpl></infAdic>
</infNFe></NFe>
<protNFe><infProt><cStat>100</cStat><nProt>150260000123456</nProt><dhRecbto>2026-06-30T10:20:00-04:00</dhRecbto></infProt></protNFe>
</nfeProc>`;

describe('extrairNfe', () => {
  const nfe = extrairNfe(XML);

  it('lê a chave de acesso do atributo Id, sem o prefixo NFe', () => {
    expect(nfe.chave).toBe('50260600000000000191550010001160671000116060');
    expect(nfe.chave).toHaveLength(44);
  });

  it('lê identificação, emitente e destinatário apesar do namespace', () => {
    expect(nfe.numero).toBe('116067');
    expect(nfe.serie).toBe('1');
    expect(nfe.naturezaOperacao).toBe('VENDA DE MERCADORIA');
    expect(nfe.emitente.nome).toBe('RCG COMERCIO LTDA');
    expect(nfe.emitente.endereco.municipio).toBe('CAMPO GRANDE');
    expect(nfe.destinatario.documento).toBe('11222333000181');
  });

  it('lê o protocolo de autorização do nfeProc', () => {
    expect(nfe.protocolo).toBe('150260000123456');
    expect(nfe.cancelada).toBe(false);
  });

  it('decodifica entidade e CDATA na descrição do produto', () => {
    expect(nfe.itens[0].descricao).toBe('PARAFUSO 3/8 & PORCA');
    expect(nfe.itens[1].descricao).toBe('ARRUELA <LISA> 3/8');
  });

  it('lê o ICMS qualquer que seja o grupo de tributação', () => {
    expect(nfe.itens[0].cst).toBe('000');
    expect(nfe.itens[0].aliquotaIcms).toBe(17);
    // Simples Nacional: CSOSN no lugar de CST, e sem base/valor de ICMS.
    expect(nfe.itens[1].cst).toBe('0102');
    expect(nfe.itens[1].valorIcms).toBeNull();
  });

  it('lê totais, duplicatas e transporte', () => {
    expect(nfe.totais.valorTotal).toBe(312.5);
    expect(nfe.totais.valorProdutos).toBe(290);
    expect(nfe.duplicatas).toEqual([
      { numero: '001', vencimento: '2026-07-28', valor: 312.5 },
    ]);
    expect(nfe.transporte.transportador).toBe('TRANSPORTES XYZ');
    expect(nfe.transporte.pesoBruto).toBe(15.5);
  });

  it('marca como cancelada quando o protocolo é de cancelamento', () => {
    const cancelada = extrairNfe(XML.replace('<cStat>100</cStat>', '<cStat>101</cStat>'));
    expect(cancelada.cancelada).toBe(true);
  });

  it('recusa XML que não é NF-e', () => {
    expect(() => extrairNfe('<pedido><item/></pedido>')).toThrow(NfeXmlInvalidoError);
  });

  it('recusa NF-e sem chave de 44 dígitos', () => {
    expect(() => extrairNfe('<NFe><infNFe Id="NFe123"><ide/></infNFe></NFe>')).toThrow(
      NfeXmlInvalidoError,
    );
  });
});

describe('lerXml', () => {
  it('descarta DOCTYPE sem resolver entidade externa (XXE)', () => {
    const raiz = lerXml(
      '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><a><b>ok</b></a>',
    );
    expect(raiz.filhos[0].nome).toBe('a');
    expect(raiz.filhos[0].filhos[0].texto).toBe('ok');
  });

  it('trata tag vazia sem desbalancear a árvore', () => {
    const raiz = lerXml('<a><b/><c>2</c></a>');
    expect(raiz.filhos[0].filhos.map((f) => f.nome)).toEqual(['b', 'c']);
  });
});
