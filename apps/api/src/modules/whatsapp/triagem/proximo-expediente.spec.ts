import {
  EXPEDIENTE_PADRAO,
  proximoAtendimento,
  type FaixaExpediente,
} from './proximo-expediente';

/**
 * Os instantes sao construidos em **UTC**, e as horas locais anotadas ao lado.
 *
 * A operacao roda em America/Campo_Grande (UTC-4) e o container em UTC. A
 * primeira versao destes testes usava `new Date(ano, mes, dia, hora)` — hora do
 * processo — e por isso media 15h local achando que media 19h. O erro estava no
 * teste, mas ele revelou um de verdade no codigo: o vencimento era montado com
 * `setHours`, tambem no fuso do processo, e sairia 4 horas cedo.
 */
const agenda = (faixas: FaixaExpediente[], feriados: string[] = []) => ({
  fusoHorario: 'America/Campo_Grande',
  faixas,
  feriados,
});

const utc = (dia: number, horaUtc: number, min = 0) =>
  new Date(Date.UTC(2026, 8, dia, horaUtc, min));

// 07/09/2026 e uma segunda-feira.
const segManha = utc(7, 14); // 10:00 local
const segCedo = utc(7, 10, 30); // 06:30 local
const segNoite = utc(7, 23); // 19:00 local
const sexNoite = utc(12, 0); // sexta 11/09, 20:00 local
const sabDia = utc(12, 14); // sabado 12/09, 10:00 local
const domTarde = utc(13, 19); // domingo 13/09, 15:00 local

describe('proximoAtendimento', () => {
  it('no meio do expediente, atende hoje mesmo', () => {
    expect(proximoAtendimento(agenda(EXPEDIENTE_PADRAO), segManha).emDias).toBe(0);
  });

  it('antes de abrir, atende hoje ainda', () => {
    const r = proximoAtendimento(agenda(EXPEDIENTE_PADRAO), segCedo);
    expect(r.emDias).toBe(0);
    expect(r.hora).toBe('08:00');
  });

  it('depois de fechar, joga para o proximo dia util', () => {
    const r = proximoAtendimento(agenda(EXPEDIENTE_PADRAO), segNoite);
    expect(r.emDias).toBe(1);
    expect(r.dia).toBe('terça-feira');
  });

  it('sexta a noite cai na segunda, e nao no sabado', () => {
    const r = proximoAtendimento(agenda(EXPEDIENTE_PADRAO), sexNoite);
    expect(r.dia).toBe('segunda-feira');
    expect(r.emDias).toBe(3);
  });

  it('sabado cai na segunda', () => {
    expect(proximoAtendimento(agenda(EXPEDIENTE_PADRAO), sabDia).dia).toBe(
      'segunda-feira',
    );
  });

  it('domingo cai na segunda seguinte', () => {
    const r = proximoAtendimento(agenda(EXPEDIENTE_PADRAO), domTarde);
    expect(r.dia).toBe('segunda-feira');
    expect(r.emDias).toBe(1);
  });

  it('empresa que atende sabado tem sabado', () => {
    const comSabado: FaixaExpediente[] = [
      ...EXPEDIENTE_PADRAO,
      { diaSemana: 6, horaInicio: '08:00', horaFim: '12:00' },
    ];
    const r = proximoAtendimento(agenda(comSabado), sexNoite);
    expect(r.dia).toBe('sábado');
    expect(r.hora).toBe('08:00');
  });

  it('sem faixa nenhuma usa o comercial classico', () => {
    const r = proximoAtendimento(agenda([]), sabDia);
    expect(r.dia).toBe('segunda-feira');
    expect(r.hora).toBe('08:00');
  });

  it('escolhe a primeira faixa do dia quando ha mais de uma', () => {
    const dobrado: FaixaExpediente[] = [
      { diaSemana: 2, horaInicio: '13:00', horaFim: '18:00' },
      { diaSemana: 2, horaInicio: '08:00', horaFim: '12:00' },
    ];
    expect(proximoAtendimento(agenda(dobrado), segNoite).hora).toBe('08:00');
  });

  describe('o vencimento e o instante certo, e nao a hora do fuso do processo', () => {
    it('08:00 local de segunda = 12:00 UTC', () => {
      const r = proximoAtendimento(agenda(EXPEDIENTE_PADRAO), sexNoite);
      expect(r.quando.toISOString()).toBe('2026-09-14T12:00:00.000Z');
    });

    it('o dia do calendario e o local, nao o do processo', () => {
      // 23:00 UTC de segunda ainda e segunda 19:00 local; o proximo e terca.
      const r = proximoAtendimento(agenda(EXPEDIENTE_PADRAO), segNoite);
      expect(r.quando.toISOString()).toBe('2026-09-08T12:00:00.000Z');
    });

    it('nunca cai de madrugada no fuso da operacao', () => {
      for (const agora of [segCedo, segNoite, sexNoite, sabDia, domTarde]) {
        const r = proximoAtendimento(agenda(EXPEDIENTE_PADRAO), agora);
        const horaLocal = new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Campo_Grande',
          hour: '2-digit',
          hour12: false,
        }).format(r.quando);
        expect(Number(horaLocal)).toBeGreaterThanOrEqual(6);
      }
    });
  });
});

describe('proximoAtendimento com feriados', () => {
  // 07/09/2026 (Independencia) cai numa segunda-feira.
  const sexAntes = utc(4, 23); // sexta 04/09, 19:00 local — fechado

  it('pula o feriado e cai no dia util seguinte', () => {
    const r = proximoAtendimento(
      agenda(EXPEDIENTE_PADRAO, ['2026-09-07']),
      sexAntes,
    );
    expect(r.dia).toBe('terça-feira');
    expect(r.quando.toISOString().slice(0, 10)).toBe('2026-09-08');
  });

  it('sem o feriado cadastrado, marcaria para a propria segunda', () => {
    // Prova que o teste acima mede o feriado, e nao o fim de semana.
    const r = proximoAtendimento(agenda(EXPEDIENTE_PADRAO), sexAntes);
    expect(r.quando.toISOString().slice(0, 10)).toBe('2026-09-07');
  });

  it('pula emenda de varios dias', () => {
    // Natal (sexta) e o dia 28 (segunda) como ponto facultativo da empresa.
    //  acima e fixo em setembro — aqui a data e outra, e vai explicita.
    const quaAntes = new Date(Date.UTC(2026, 11, 23, 23)); // 19:00 local
    const r = proximoAtendimento(
      agenda(EXPEDIENTE_PADRAO, ['2026-12-24', '2026-12-25', '2026-12-28']),
      quaAntes,
    );
    expect(r.quando.toISOString().slice(0, 10)).toBe('2026-12-29');
  });

  it('feriado no meio da semana nao afeta os outros dias', () => {
    const segAntes = utc(7, 14); // segunda 10:00 local, mas feriado
    const r = proximoAtendimento(
      agenda(EXPEDIENTE_PADRAO, ['2026-09-07']),
      segAntes,
    );
    expect(r.emDias).toBe(1);
  });

  it('nao entra em laco quando quase tudo e feriado', () => {
    const muitos = Array.from({ length: 13 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 8, 7 + i));
      return d.toISOString().slice(0, 10);
    });
    const r = proximoAtendimento(agenda(EXPEDIENTE_PADRAO, muitos), utc(7, 14));
    expect(r.quando).toBeInstanceOf(Date);
  });
});

describe('proximoAtendimento em outro fuso', () => {
  it('a mesma hora UTC da resultados diferentes conforme o fuso', () => {
    // 23:00 UTC de segunda: 20:00 em Sao Paulo (fechado, vai para terca) e
    // 19:00 em Campo Grande (tambem fechado). Em Rio Branco (UTC-5) sao 18:00,
    // e a faixa termina as 18:00 — tambem fechado. O que muda e o instante do
    // retorno.
    const instante = utc(7, 23);
    const sp = proximoAtendimento(
      { fusoHorario: 'America/Sao_Paulo', faixas: EXPEDIENTE_PADRAO },
      instante,
    );
    const cg = proximoAtendimento(
      { fusoHorario: 'America/Campo_Grande', faixas: EXPEDIENTE_PADRAO },
      instante,
    );
    // 08:00 local de terca em cada fuso e um instante UTC diferente.
    expect(sp.quando.toISOString()).toBe('2026-09-08T11:00:00.000Z');
    expect(cg.quando.toISOString()).toBe('2026-09-08T12:00:00.000Z');
  });

  it('fuso vazio cai no padrao, sem quebrar', () => {
    const r = proximoAtendimento(
      { fusoHorario: null, faixas: EXPEDIENTE_PADRAO },
      utc(7, 23),
    );
    expect(r.quando.toISOString()).toBe('2026-09-08T12:00:00.000Z');
  });
});
