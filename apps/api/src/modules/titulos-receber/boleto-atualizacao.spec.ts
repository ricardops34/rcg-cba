import {
  calcularEncargos,
  diasEmAtraso,
  foraDoPrazoDeReemissao,
  PRAZO_MAXIMO_REEMISSAO_DIAS,
} from './boleto-atualizacao';

const HOJE = new Date(2026, 7, 21); // 21/08/2026
const VENCIDO_24_DIAS = new Date(2026, 6, 28); // 28/07/2026

describe('diasEmAtraso', () => {
  it('conta dias corridos do vencimento até hoje', () => {
    expect(diasEmAtraso(VENCIDO_24_DIAS, HOJE)).toBe(24);
  });

  it('devolve 0 para título a vencer, no dia, ou sem vencimento', () => {
    expect(diasEmAtraso(new Date(2026, 8, 30), HOJE)).toBe(0);
    expect(diasEmAtraso(HOJE, HOJE)).toBe(0);
    expect(diasEmAtraso(null, HOJE)).toBe(0);
  });
});

describe('foraDoPrazoDeReemissao', () => {
  it('permite até o 30º dia de atraso e bloqueia a partir do 31º', () => {
    const trintaDias = new Date(2026, 6, 22);
    const trintaEUmDias = new Date(2026, 6, 21);
    expect(diasEmAtraso(trintaDias, HOJE)).toBe(PRAZO_MAXIMO_REEMISSAO_DIAS);
    expect(foraDoPrazoDeReemissao(trintaDias, HOJE)).toBe(false);
    expect(foraDoPrazoDeReemissao(trintaEUmDias, HOJE)).toBe(true);
  });
});

describe('calcularEncargos', () => {
  it('atualiza o valor do título vencido com multa e juros pro rata', () => {
    const encargos = calcularEncargos({
      saldo: 1260.5,
      vencimento: VENCIDO_24_DIAS,
      multaPerc: 2,
      jurosMesPerc: 1,
      hoje: HOJE,
    });

    // Multa: 2% de 1260,50. Juros: 1%/30 ao dia × 24 dias.
    expect(encargos.multa).toBe(25.21);
    expect(encargos.juros).toBe(10.08);
    expect(encargos.valor).toBe(1295.79);
    expect(encargos.diasAtraso).toBe(24);
  });

  it('não cobra nada além do saldo enquanto o título não vence', () => {
    const encargos = calcularEncargos({
      saldo: 1260.5,
      vencimento: new Date(2026, 8, 30),
      multaPerc: 2,
      jurosMesPerc: 1,
      hoje: HOJE,
    });
    expect(encargos.valor).toBe(1260.5);
    expect(encargos.multa).toBe(0);
    expect(encargos.juros).toBe(0);
  });

  it('sem percentual cadastrado no convênio, não inventa encargo', () => {
    // Cobrar multa "padrão" seria cobrar do cliente o que a empresa nunca
    // combinou com ele.
    const encargos = calcularEncargos({
      saldo: 1000,
      vencimento: VENCIDO_24_DIAS,
      multaPerc: null,
      jurosMesPerc: null,
      hoje: HOJE,
    });
    expect(encargos.valor).toBe(1000);
    expect(encargos.diasAtraso).toBe(24);
  });
});
