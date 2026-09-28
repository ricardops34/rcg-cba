import { linhasPagador, montarBoletoPdf } from './boleto-pdf';

describe('montarBoletoPdf', () => {
  it('gerar boleto PDF com layout de 3 vias (VIA EMPRESA, VIA PAGADOR, FICHA DE COMPENSAÇÃO)', async () => {
    const res = await montarBoletoPdf({
      banco: { codigo: '237', nome: 'BRADESCO', logoUrl: null },
      beneficiario: {
        nome: 'RCG DISTRIBUIDORA - 01',
        documento: '03.715.067/0001-09',
        endereco: 'RUA TREZE DE MAIO, 1472 - CENTRO',
        agenciaConta: '2201-2/00145750',
      },
      pagador: {
        codigo: '004199-01',
        nome: 'IPE DOURADO CAFE E RESTAURANTE LTDA',
        documento: '19123290000199',
        endereco: 'AV. MARGINAL LESTE,10105',
        bairro: 'CHAC. CASTELO II',
        municipio: 'DOURADOS',
        uf: 'MS',
        cep: '79842000',
      },
      titulo: {
        numeroDocumento: '000116883',
        vencimento: new Date('2026-09-25T00:00:00.000Z'),
        emissao: new Date('2026-08-27T00:00:00.000Z'),
        valor: 1164.06,
        carteira: '09',
        especieDocumento: 'DM',
        aceite: 'Sim',
        impressoPor: 'Ricardo.Patay',
      },
      localPagamento: 'Pagável Preferencialmente na rede Bradesco ou no Bradesco expresso',
      instrucoes: [
        'Importancia por Dia de Atraso de R$ 2,28',
        'Após Vencimento Cobrar Multa de R$ 22,78',
        ' - - - 2º Via - - -',
        'Boleto atualizado para pagamento apenas nesta data.',
      ],
      demonstrativo: null,
      codigo: {
        banco: '237',
        agencia: '2201',
        conta: '14575',
        carteira: '09',
        nossoNumero: '00000066342',
        vencimento: new Date('2026-09-25T00:00:00.000Z'),
        valor: 1164.06,
      },
    });

    expect(res.conteudo).toBeInstanceOf(Buffer);
    expect(res.conteudo.length).toBeGreaterThan(1000);
    expect(res.linhaDigitavelFormatada).toBe('23792.20102 90000.006636 42001.457508 2 15800000116406');
    expect(res.codigoBarras).toBe('23792158000001164062201090000006634200145750');
  });
});

describe('linhasPagador', () => {
  it('monta as três linhas no padrão do boleto do ERP', () => {
    expect(
      linhasPagador({
        codigo: '004199-01',
        nome: 'IPE DOURADO CAFE E RESTAURANTE LTDA',
        documento: '19123290000199',
        endereco: 'AV. MARGINAL LESTE,10105',
        bairro: 'CHAC. CASTELO II',
        municipio: 'DOURADOS',
        uf: 'MS',
        cep: '79842000',
      }),
    ).toEqual([
      '(004199-01) IPE DOURADO CAFE E RESTAURANTE LTDA',
      'AV. MARGINAL LESTE,10105-CHAC. CASTELO II',
      'DOURADOS-MS CEP:79842-000 CNPJ: 19.123.290/0001-99',
    ]);
  });

  it('usa CPF para documento de 11 dígitos e some com a parte vazia', () => {
    expect(
      linhasPagador({
        codigo: null,
        nome: 'FULANO DE TAL',
        documento: '12345678901',
        endereco: 'RUA A, 1',
        bairro: null,
        municipio: 'DOURADOS',
        uf: 'MS',
        cep: null,
      }),
    ).toEqual(['FULANO DE TAL', 'RUA A, 1', 'DOURADOS-MS CPF: 123.456.789-01']);
  });
});
