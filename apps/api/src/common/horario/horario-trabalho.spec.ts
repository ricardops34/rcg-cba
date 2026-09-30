import { dentroDoExpediente } from './horario-trabalho';

describe('expediente e feriado', () => {
  // Quarta-feira, 30/09/2026, 10:00 em Campo Grande (14:00 UTC).
  const agora = new Date('2026-09-30T14:00:00.000Z');
  const semanaToda = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
    diaSemana,
    horaInicio: '00:00',
    horaFim: '23:59',
  }));

  it('feriado barra quem tem a restrição de horário', () => {
    const r = dentroDoExpediente(true, semanaToda, agora, 'Aniversário da cidade');
    expect(r.dentro).toBe(false);
    expect(r.motivo).toBe('Feriado: Aniversário da cidade');
  });

  it('feriado não pesa para quem não tem a restrição', () => {
    expect(dentroDoExpediente(false, [], agora, 'Aniversário da cidade').dentro).toBe(true);
  });

  it('sem feriado, vale a faixa do dia', () => {
    expect(dentroDoExpediente(true, semanaToda, agora, null).dentro).toBe(true);
  });
});
