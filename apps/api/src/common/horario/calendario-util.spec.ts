import { CalendarioUtil, carregarCalendarioUtil } from './calendario-util';
import { calcularEncargos } from '../../modules/titulos-receber/boleto-atualizacao';

describe('Calendário útil da empresa', () => {
  const calendario = new CalendarioUtil(['2026-10-12', '2027-01-01']);
  it('preserva dia útil e horário, sem modificar a entrada', () => {
    const data = new Date('2026-10-09T18:30:00Z');
    expect(calendario.ajustar(data).toISOString()).toBe(data.toISOString());
  });
  it('pula sábado, domingo e feriado consecutivo mantendo o horário local', () => {
    expect(
      calendario.ajustar(new Date('2026-10-10T18:30:00Z')).toISOString(),
    ).toBe('2026-10-13T18:30:00.000Z');
  });
  it('usa o dia local nos agendamentos próximos à meia-noite UTC', () => {
    expect(
      calendario.ajustar(new Date('2026-10-10T01:00:00Z')).toISOString(),
    ).toBe('2026-10-10T01:00:00.000Z');
  });
  it('usa data civil para vencimento e atravessa a virada do ano', () => {
    expect(
      calendario.vencimento(new Date('2027-01-01T00:00:00Z'))?.toISOString(),
    ).toBe('2027-01-04T00:00:00.000Z');
    expect(calendario.vencimento(null)).toBeNull();
  });
  it('filtro no banco equivale a comparar o vencimento ajustado, inclusive no feriado', () => {
    for (let dia = 9; dia <= 15; dia++) {
      const hoje = new Date(
        `2026-10-${String(dia).padStart(2, '0')}T00:00:00Z`,
      );
      for (let venc = 8; venc <= 16; venc++) {
        const original = new Date(
          `2026-10-${String(venc).padStart(2, '0')}T00:00:00Z`,
        );
        expect(original < calendario.corteVencidos(hoje)).toBe(
          calendario.vencimento(original)! < hoje,
        );
      }
    }
  });
  it('não cobra encargos até o vencimento efetivo, cobrando a partir do dia seguinte', () => {
    const vencimento = calendario.vencimento(new Date('2026-10-10T00:00:00Z'));
    const base = { saldo: 100, vencimento, multaPerc: 2, jurosMesPerc: 3 };
    const noDia = calcularEncargos({
      ...base,
      hoje: new Date('2026-10-13T00:00:00Z'),
    });
    expect(noDia.diasAtraso).toBe(0);
    expect(noDia.multa).toBe(0);
    expect(noDia.juros).toBe(0);
    const depois = calcularEncargos({
      ...base,
      hoje: new Date('2026-10-14T00:00:00Z'),
    });
    expect(depois.diasAtraso).toBe(1);
    expect(depois.multa).toBe(2);
    expect(depois.juros).toBeCloseTo(0.1);
  });
  it('consulta somente os feriados da empresa informada', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([{ data: new Date('2026-10-12T00:00:00Z') }]);
    const c = await carregarCalendarioUtil(
      { feriado: { findMany } } as never,
      'empresa-1',
    );
    expect(findMany).toHaveBeenCalledWith({
      where: { empresaId: 'empresa-1' },
      select: { data: true },
    });
    expect(c.util('2026-10-12')).toBe(false);
    expect(new CalendarioUtil([]).util('2026-10-12')).toBe(true);
  });
});
