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
  it('permite até o 60º dia de atraso (padrão) e bloqueia a partir do 61º', () => {
    const sessentaDias = new Date(2026, 5, 22); // 22/06/2026
    const sessentaEUmDias = new Date(2026, 5, 21); // 21/06/2026
    expect(diasEmAtraso(sessentaDias, HOJE)).toBe(PRAZO_MAXIMO_REEMISSAO_DIAS);
    expect(foraDoPrazoDeReemissao(sessentaDias, HOJE)).toBe(false);
    expect(foraDoPrazoDeReemissao(sessentaEUmDias, HOJE)).toBe(true);
  });

  it('respeita o prazo máximo customizado em parâmetro', () => {
    const trintaDias = new Date(2026, 6, 22);
    expect(foraDoPrazoDeReemissao(trintaDias, HOJE, 15)).toBe(true);
    expect(foraDoPrazoDeReemissao(trintaDias, HOJE, 30)).toBe(false);
  });
});

describe('calcularEncargos', () => {
  it('atualiza o título vencido com a multa e os juros por dia do ERP', () => {
    const encargos = calcularEncargos({
      saldo: 1260.5,
      vencimento: VENCIDO_24_DIAS,
      multaValor: 25.21,
      jurosValorDia: 0.42,
      hoje: HOJE,
    });

    // Multa: o valor do título. Juros: R$ 0,42 ao dia × 24 dias.
    expect(encargos.multa).toBe(25.21);
    expect(encargos.juros).toBe(10.08);
    expect(encargos.valor).toBe(1295.79);
    expect(encargos.diasAtraso).toBe(24);
  });

  it('não cobra nada além do saldo enquanto o título não vence', () => {
    const encargos = calcularEncargos({
      saldo: 1260.5,
      vencimento: new Date(2026, 8, 30),
      multaValor: 25.21,
      jurosValorDia: 0.42,
      hoje: HOJE,
    });
    expect(encargos.valor).toBe(1260.5);
    expect(encargos.multa).toBe(0);
    expect(encargos.juros).toBe(0);
  });

  it('sem valor do ERP no título, não inventa encargo', () => {
    // O percentual da conta não entra mais (decisão de 2026-10-09): cobrar
    // encargo que o boleto do cliente não diz seria cobrar o que ninguém
    // combinou com ele.
    const encargos = calcularEncargos({
      saldo: 1000,
      vencimento: VENCIDO_24_DIAS,
      multaValor: null,
      jurosValorDia: null,
      hoje: HOJE,
    });
    expect(encargos.valor).toBe(1000);
    expect(encargos.diasAtraso).toBe(24);
  });
});
