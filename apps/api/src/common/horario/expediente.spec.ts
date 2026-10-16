import { CalendarioUtil } from './calendario-util';
import {
  ajustarAoExpediente,
  diaLocal,
  instanteLocal,
  type ExpedienteUsuario,
} from './expediente';

/**
 * Fuso da operação: America/Campo_Grande (UTC-4, sem horário de verão desde
 * 2019). Os instantes abaixo são montados pelo relógio de parede para o teste
 * ler como a tela lê.
 */
describe('ajustarAoExpediente', () => {
  const noRelogio = (dia: string, hhmm: string) => instanteLocal(dia, hhmm);
  // 2030-03-11 é uma segunda-feira.
  const SEG = '2030-03-11';
  const TER = '2030-03-12';
  const SEX = '2030-03-15';
  const SAB = '2030-03-16';
  const SEG_SEGUINTE = '2030-03-18';

  const faixas = (dias: number[], inicio = '08:00', fim = '18:00') =>
    dias.map((diaSemana) => ({ diaSemana, horaInicio: inicio, horaFim: fim }));
  const restrito: ExpedienteUsuario = {
    restringir: true,
    horarios: faixas([1, 2, 3, 4, 5]),
  };
  const calendario = new CalendarioUtil([]);

  it('instanteLocal e diaLocal fecham o ciclo', () => {
    const instante = noRelogio(SEG, '08:30');
    expect(diaLocal(instante)).toBe(SEG);
    // 08:30 em UTC-4 = 12:30 UTC
    expect(instante.toISOString()).toBe('2030-03-11T12:30:00.000Z');
  });

  it('sem restrição de horário, só os dias úteis contam e a hora é mantida', () => {
    const sabado10h = noRelogio(SAB, '10:00');
    const ajustada = ajustarAoExpediente(sabado10h, calendario, null);
    expect(ajustada.toISOString()).toBe(
      noRelogio(SEG_SEGUINTE, '10:00').toISOString(),
    );

    const livre: ExpedienteUsuario = { restringir: false, horarios: [] };
    const tarde = noRelogio(TER, '23:30');
    expect(ajustarAoExpediente(tarde, calendario, livre).toISOString()).toBe(
      tarde.toISOString(),
    );
  });

  it('dentro do expediente, não mexe', () => {
    const meioDia = noRelogio(TER, '12:00');
    expect(
      ajustarAoExpediente(meioDia, calendario, restrito).toISOString(),
    ).toBe(meioDia.toISOString());
  });

  it('antes do início, vai para o início do mesmo dia', () => {
    const cedo = noRelogio(TER, '06:15');
    expect(ajustarAoExpediente(cedo, calendario, restrito).toISOString()).toBe(
      noRelogio(TER, '08:00').toISOString(),
    );
  });

  it('no fim do expediente (18:00 em ponto) já é fora: vai para o próximo dia útil', () => {
    const fim = noRelogio(TER, '18:00');
    expect(ajustarAoExpediente(fim, calendario, restrito).toISOString()).toBe(
      noRelogio('2030-03-13', '08:00').toISOString(),
    );
  });

  it('sexta à noite vai para a segunda de manhã', () => {
    const noite = noRelogio(SEX, '19:00');
    expect(ajustarAoExpediente(noite, calendario, restrito).toISOString()).toBe(
      noRelogio(SEG_SEGUINTE, '08:00').toISOString(),
    );
  });

  it('feriado pula para o próximo dia útil com expediente', () => {
    const comFeriado = new CalendarioUtil([TER]);
    const meioDia = noRelogio(TER, '12:00');
    expect(
      ajustarAoExpediente(meioDia, comFeriado, restrito).toISOString(),
    ).toBe(noRelogio('2030-03-13', '08:00').toISOString());
  });

  it('dia da semana sem faixa cadastrada não tem expediente', () => {
    // Só terça e quinta.
    const doisDias: ExpedienteUsuario = {
      restringir: true,
      horarios: faixas([2, 4]),
    };
    const segunda = noRelogio(SEG, '10:00');
    expect(
      ajustarAoExpediente(segunda, calendario, doisDias).toISOString(),
    ).toBe(noRelogio(TER, '08:00').toISOString());
  });

  it('respeita a faixa de cada dia (sexta mais curta)', () => {
    const curtaNaSexta: ExpedienteUsuario = {
      restringir: true,
      horarios: [
        ...faixas([1, 2, 3, 4]),
        { diaSemana: 5, horaInicio: '08:00', horaFim: '12:00' },
      ],
    };
    const sexta15h = noRelogio(SEX, '15:00');
    expect(
      ajustarAoExpediente(sexta15h, calendario, curtaNaSexta).toISOString(),
    ).toBe(noRelogio(SEG_SEGUINTE, '08:00').toISOString());
  });
});
