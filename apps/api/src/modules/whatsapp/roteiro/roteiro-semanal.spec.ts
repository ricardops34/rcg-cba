import type { RoteiroCriterios } from '@plataforma/contracts';
import { CalendarioUtil } from '../../../common/horario/calendario-util';
import { instanteLocal } from '../../../common/horario/expediente';
import {
  diasDoPeriodo,
  distribuir,
  gerarHorariosLivres,
  mesmoDiaMesAnterior,
  ocupadosDaAgenda,
  selecionarCandidatos,
  type ClienteMetricas,
} from './roteiro-semanal';

/**
 * Regras do roteiro semanal (§7 de docs/planos/2026-10-16-agendamentos-whatsapp.md).
 * Datas fixas: 2030-03-11 é segunda-feira; o fuso é o da operação (UTC-4).
 */
describe('selecionarCandidatos', () => {
  const hoje = new Date('2030-03-11T12:00:00Z');
  const base = (
    id: string,
    parcial: Partial<ClienteMetricas>,
  ): ClienteMetricas => ({
    clienteId: id,
    nome: `Cliente ${id}`,
    ultimaCompra: null,
    comprouMesPassado: false,
    comprouNoMes: false,
    comprouMesmoPeriodoMesPassado: false,
    tituloVencidoDesde: null,
    valorVencido: 0,
    ...parcial,
  });
  const criterios = (c: Partial<RoteiroCriterios>): RoteiroCriterios => ({
    tituloVencido: false,
    naoCompraramNoMes: false,
    mesmoPeriodoMesPassado: false,
    ...c,
  });

  it('sem compra: só quem comprou e parou há N dias (quem nunca comprou não entra)', () => {
    const clientes = [
      base('a', { ultimaCompra: new Date('2030-01-01T00:00:00Z') }), // 69 dias
      base('b', { ultimaCompra: new Date('2030-03-01T00:00:00Z') }), // 10 dias
      base('c', { ultimaCompra: null }),
    ];
    const r = selecionarCandidatos(
      clientes,
      criterios({ semCompraDias: 30 }),
      hoje,
    );
    expect(r.map((x) => x.clienteId)).toEqual(['a']);
    expect(r[0].motivos).toEqual(['sem_compra']);
    expect(r[0].detalhe).toContain('69 dias');
  });

  it('comprou no mês passado e ainda não neste', () => {
    const clientes = [
      base('a', { comprouMesPassado: true, comprouNoMes: false }),
      base('b', { comprouMesPassado: true, comprouNoMes: true }),
      base('c', { comprouMesPassado: false }),
    ];
    const r = selecionarCandidatos(
      clientes,
      criterios({ naoCompraramNoMes: true }),
      hoje,
    );
    expect(r.map((x) => x.clienteId)).toEqual(['a']);
  });

  it('mesmo período do mês passado, desde que ainda não tenha comprado neste mês', () => {
    const clientes = [
      base('a', { comprouMesmoPeriodoMesPassado: true }),
      base('b', { comprouMesmoPeriodoMesPassado: true, comprouNoMes: true }),
    ];
    const r = selecionarCandidatos(
      clientes,
      criterios({ mesmoPeriodoMesPassado: true }),
      hoje,
    );
    expect(r.map((x) => x.clienteId)).toEqual(['a']);
  });

  it('um cliente em vários critérios aparece uma vez, com todos os motivos', () => {
    const clientes = [
      base('a', {
        ultimaCompra: new Date('2030-01-01T00:00:00Z'),
        tituloVencidoDesde: new Date('2030-02-01T00:00:00Z'),
        valorVencido: 1500,
      }),
    ];
    const r = selecionarCandidatos(
      clientes,
      criterios({ semCompraDias: 30, tituloVencido: true }),
      hoje,
    );
    expect(r).toHaveLength(1);
    expect(r[0].motivos).toEqual(['titulo_vencido', 'sem_compra']);
  });

  it('ordem: título vencido (mais antigo) → mais tempo sem comprar → mês passado → mesmo período', () => {
    const clientes = [
      base('periodo', { comprouMesmoPeriodoMesPassado: true }),
      base('mes', { comprouMesPassado: true }),
      base('semCompraPouco', {
        ultimaCompra: new Date('2030-02-01T00:00:00Z'),
      }),
      base('semCompraMuito', {
        ultimaCompra: new Date('2029-10-01T00:00:00Z'),
      }),
      base('tituloRecente', {
        tituloVencidoDesde: new Date('2030-03-01T00:00:00Z'),
      }),
      base('tituloAntigo', {
        tituloVencidoDesde: new Date('2030-01-01T00:00:00Z'),
      }),
    ];
    const r = selecionarCandidatos(
      clientes,
      criterios({
        semCompraDias: 10,
        tituloVencido: true,
        naoCompraramNoMes: true,
        mesmoPeriodoMesPassado: true,
      }),
      hoje,
    );
    expect(r.map((x) => x.clienteId)).toEqual([
      'tituloAntigo',
      'tituloRecente',
      'semCompraMuito',
      'semCompraPouco',
      'mes',
      'periodo',
    ]);
  });
});

describe('períodos', () => {
  it('lista os dias, inclusive as pontas', () => {
    expect(diasDoPeriodo('2030-03-11', '2030-03-13')).toEqual([
      '2030-03-11',
      '2030-03-12',
      '2030-03-13',
    ]);
  });

  it('um mês antes, com o dia ajustado quando o mês anterior é mais curto', () => {
    expect(mesmoDiaMesAnterior('2030-03-15')).toBe('2030-02-15');
    expect(mesmoDiaMesAnterior('2030-03-31')).toBe('2030-02-28');
    expect(mesmoDiaMesAnterior('2030-01-10')).toBe('2029-12-10');
  });
});

describe('gerarHorariosLivres', () => {
  const calendario = new CalendarioUtil([]);
  const agora = new Date('2030-03-08T12:00:00Z'); // sexta, antes do período
  const faixas = (dias: number[], inicio = '08:00', fim = '10:00') =>
    dias.map((diaSemana) => ({ diaSemana, horaInicio: inicio, horaFim: fim }));
  const padrao = { horaInicio: '08:00', horaFim: '10:00' };
  const local = (dia: string, hhmm: string) =>
    instanteLocal(dia, hhmm).toISOString();

  it('um horário a cada intervalo, dentro do expediente cadastrado', () => {
    const horarios = gerarHorariosLivres({
      dias: ['2030-03-11'],
      calendario,
      expediente: { restringir: true, horarios: faixas([1]) },
      padrao,
      intervaloMin: 30,
      ocupados: [],
      agora,
    });
    expect(horarios.map((h) => h.toISOString())).toEqual([
      local('2030-03-11', '08:00'),
      local('2030-03-11', '08:30'),
      local('2030-03-11', '09:00'),
      local('2030-03-11', '09:30'),
    ]);
  });

  it('pula fim de semana, feriado e dia sem faixa no cadastro', () => {
    const horarios = gerarHorariosLivres({
      // sáb, dom, seg (feriado), ter (sem faixa), qua
      dias: [
        '2030-03-09',
        '2030-03-10',
        '2030-03-11',
        '2030-03-12',
        '2030-03-13',
      ],
      calendario: new CalendarioUtil(['2030-03-11']),
      expediente: { restringir: true, horarios: faixas([1, 3]) },
      padrao,
      intervaloMin: 60,
      ocupados: [],
      agora,
    });
    expect(horarios.map((h) => h.toISOString())).toEqual([
      local('2030-03-13', '08:00'),
      local('2030-03-13', '09:00'),
    ]);
  });

  it('sem expediente cadastrado usa o início e o fim informados', () => {
    const horarios = gerarHorariosLivres({
      dias: ['2030-03-11'],
      calendario,
      expediente: { restringir: false, horarios: [] },
      padrao: { horaInicio: '14:00', horaFim: '15:00' },
      intervaloMin: 30,
      ocupados: [],
      agora,
    });
    expect(horarios.map((h) => h.toISOString())).toEqual([
      local('2030-03-11', '14:00'),
      local('2030-03-11', '14:30'),
    ]);
  });

  it('só horários livres: o que já está na agenda é pulado', () => {
    const ocupados = ocupadosDaAgenda(
      [
        instanteLocal('2030-03-11', '08:30'), // ocupa 08:30–09:00
        instanteLocal('2030-03-11', '00:00'), // dia inteiro: não bloqueia
      ],
      30,
    );
    const horarios = gerarHorariosLivres({
      dias: ['2030-03-11'],
      calendario,
      expediente: { restringir: true, horarios: faixas([1]) },
      padrao,
      intervaloMin: 30,
      ocupados,
      agora,
    });
    expect(horarios.map((h) => h.toISOString())).toEqual([
      local('2030-03-11', '08:00'),
      local('2030-03-11', '09:00'),
      local('2030-03-11', '09:30'),
    ]);
  });

  it('um compromisso no meio de um horário o torna ocupado', () => {
    const ocupados = ocupadosDaAgenda(
      [instanteLocal('2030-03-11', '08:15')],
      30,
    );
    const horarios = gerarHorariosLivres({
      dias: ['2030-03-11'],
      calendario,
      expediente: { restringir: true, horarios: faixas([1]) },
      padrao,
      intervaloMin: 30,
      ocupados,
      agora,
    });
    // 08:00–08:30 e 08:30–09:00 se sobrepõem ao compromisso 08:15–08:45.
    expect(horarios.map((h) => h.toISOString())).toEqual([
      local('2030-03-11', '09:00'),
      local('2030-03-11', '09:30'),
    ]);
  });

  it('hoje só entra o que ainda dá tempo (folga mínima)', () => {
    const horarios = gerarHorariosLivres({
      dias: ['2030-03-11'],
      calendario,
      expediente: { restringir: true, horarios: faixas([1]) },
      padrao,
      intervaloMin: 30,
      ocupados: [],
      // segunda 08:40 (local) — com 15 min de folga, o primeiro é 09:00
      agora: instanteLocal('2030-03-11', '08:40'),
    });
    expect(horarios.map((h) => h.toISOString())).toEqual([
      local('2030-03-11', '09:00'),
      local('2030-03-11', '09:30'),
    ]);
  });

  it('o último atendimento precisa caber inteiro antes do fim do expediente', () => {
    const horarios = gerarHorariosLivres({
      dias: ['2030-03-11'],
      calendario,
      expediente: { restringir: true, horarios: faixas([1], '08:00', '09:45') },
      padrao,
      intervaloMin: 30,
      ocupados: [],
      agora,
    });
    // 09:30–10:00 passaria das 09:45.
    expect(horarios).toHaveLength(3);
  });
});

describe('distribuir', () => {
  it('um cliente por horário, na ordem; o que sobra fica sem horário', () => {
    const horarios = [
      new Date('2030-03-11T12:00:00Z'),
      new Date('2030-03-11T12:30:00Z'),
    ];
    const r = distribuir(['a', 'b', 'c'], horarios);
    expect(r.alocados.map((x) => x.candidato)).toEqual(['a', 'b']);
    expect(r.semHorario).toEqual(['c']);
  });

  it('sobra de horário não inventa atendimento', () => {
    const r = distribuir(['a'], [new Date(), new Date(), new Date()]);
    expect(r.alocados).toHaveLength(1);
    expect(r.semHorario).toEqual([]);
  });
});
