import {
  BoletoInvalidoError,
  dvGeralCodigoBarras,
  dvModulo10,
  dvNossoNumeroBradesco,
  fatorVencimento,
  formatarLinhaDigitavel,
  linhaDigitavelDeBarras,
  montarBoleto,
} from './boleto-codigo';

/**
 * O vetor abaixo é um boleto **Bradesco real** (código de barras e linha
 * digitável publicados em ttrix.com/apple/iphone/boletoscan/boletoanatomia.html).
 *
 * Ele vale mais do que uma bateria de casos inventados: exercita de uma vez o
 * DV geral (módulo 11), os três DVs de campo (módulo 10), o fator de
 * vencimento e a montagem do campo livre do Bradesco. Se qualquer uma dessas
 * regras for alterada por engano, este teste quebra — que é exatamente o
 * problema que ninguém percebe em produção até o cliente ligar dizendo que o
 * banco recusou o pagamento.
 */
const BARRAS_REAL = '23797404300001240200448056168623793601105800';
const LINHA_REAL = '23790448095616862379336011058009740430000124020';

// Fator 4043 do vetor = 01/11/2008.
const VENCIMENTO_REAL = new Date(Date.UTC(2008, 10, 1));

describe('boleto — dígitos verificadores', () => {
  it('calcula o DV geral do código de barras (módulo 11)', () => {
    const semDv = BARRAS_REAL.slice(0, 4) + BARRAS_REAL.slice(5);
    expect(dvGeralCodigoBarras(semDv)).toBe(Number(BARRAS_REAL[4]));
  });

  it('calcula o DV de campo da linha digitável (módulo 10)', () => {
    // Campo 1 do vetor: "237904480" com DV 9.
    expect(dvModulo10('237904480')).toBe(9);
    expect(dvModulo10('5616862379')).toBe(3);
    expect(dvModulo10('3601105800')).toBe(9);
  });

  it('calcula o DV do nosso número no Bradesco', () => {
    expect(dvNossoNumeroBradesco('05', '61686237936')).toBe('4');
  });
});

describe('boleto — fator de vencimento', () => {
  it('usa o fator linear até 21/02/2025 (9999)', () => {
    expect(fatorVencimento(VENCIMENTO_REAL)).toBe(4043);
    expect(fatorVencimento(new Date(Date.UTC(2025, 1, 21)))).toBe(9999);
  });

  it('reinicia em 1000 a partir de 22/02/2025', () => {
    // Sem o reinício determinado pela FEBRABAN, todo boleto de hoje sairia
    // com fator estourado — o campo tem só 4 posições.
    expect(fatorVencimento(new Date(Date.UTC(2025, 1, 22)))).toBe(1000);
    expect(fatorVencimento(new Date(Date.UTC(2025, 1, 23)))).toBe(1001);
  });

  it('recusa vencimento anterior à data-base utilizável', () => {
    expect(() => fatorVencimento(new Date(Date.UTC(1999, 0, 1)))).toThrow(
      BoletoInvalidoError,
    );
  });
});

describe('boleto — linha digitável', () => {
  it('deriva a linha digitável do código de barras', () => {
    expect(linhaDigitavelDeBarras(BARRAS_REAL)).toBe(LINHA_REAL);
  });

  it('formata a linha em cinco blocos, como o caixa lê', () => {
    expect(formatarLinhaDigitavel(LINHA_REAL)).toBe(
      '23790.44809 56168.623793 36011.058009 7 40430000124020',
    );
  });

  it('recusa código de barras fora dos 44 dígitos', () => {
    expect(() => linhaDigitavelDeBarras('123')).toThrow(BoletoInvalidoError);
  });
});

describe('montarBoleto', () => {
  it('reproduz o boleto real a partir dos dados do título', () => {
    const boleto = montarBoleto({
      banco: '237',
      agencia: '0448',
      conta: '0110580',
      carteira: '05',
      nossoNumero: '61686237936',
      vencimento: VENCIMENTO_REAL,
      valor: 1240.2,
    });

    expect(boleto.codigoBarras).toBe(BARRAS_REAL);
    expect(boleto.linhaDigitavel).toBe(LINHA_REAL);
    expect(boleto.nossoNumeroFormatado).toBe('05/61686237936-4');
    expect(boleto.doErp).toBe(false);
  });

  it('não perde centavo por ponto flutuante', () => {
    // 1260.5 * 100 dá 126049.99999... em float; truncar cobraria a menos e
    // divergiria do valor registrado no banco.
    const boleto = montarBoleto({
      banco: '237',
      agencia: '1234',
      conta: '0567890',
      carteira: '09',
      nossoNumero: '00000001160',
      vencimento: new Date(Date.UTC(2026, 6, 28)),
      valor: 1260.5,
    });
    expect(boleto.codigoBarras.slice(9, 19)).toBe('0000126050');
  });

  it('prefere o código de barras registrado pelo ERP ao cálculo local', () => {
    const boleto = montarBoleto({
      banco: '237',
      agencia: '9999',
      conta: '9999999',
      carteira: '09',
      nossoNumero: '99999999999',
      vencimento: new Date(Date.UTC(2026, 6, 28)),
      valor: 1,
      codigoBarrasErp: BARRAS_REAL,
    });

    expect(boleto.codigoBarras).toBe(BARRAS_REAL);
    expect(boleto.linhaDigitavel).toBe(LINHA_REAL);
    expect(boleto.doErp).toBe(true);
  });

  it('recusa título sem nosso número — boleto não registrado não é pagável', () => {
    expect(() =>
      montarBoleto({
        banco: '237',
        agencia: '1234',
        conta: '0567890',
        carteira: '09',
        nossoNumero: '',
        vencimento: new Date(Date.UTC(2026, 6, 28)),
        valor: 100,
      }),
    ).toThrow(BoletoInvalidoError);
  });

  it('recusa banco sem gerador implementado', () => {
    expect(() =>
      montarBoleto({
        banco: '001',
        agencia: '1234',
        conta: '0567890',
        carteira: '17',
        nossoNumero: '00000001160',
        vencimento: new Date(Date.UTC(2026, 6, 28)),
        valor: 100,
      }),
    ).toThrow(BoletoInvalidoError);
  });
});
