import type { UsuarioHorario } from '@plataforma/contracts';
import type { TenantTx } from '../prisma/prisma.service';
import type { CalendarioUtil } from './calendario-util';
import { HORARIO_TIMEZONE, momentoLocal } from './horario-trabalho';

/**
 * Agendamento que respeita **dia útil e horário de expediente**.
 *
 * Retorno de orçamento, mensagem agendada e atendimento agendado não podem cair
 * num feriado, num fim de semana, nem fora do horário de quem vai executar:
 * um lembrete às 3h da manhã não é lembrete, e uma mensagem ao cliente fora do
 * expediente é o que o vendedor não faria à mão.
 *
 * O expediente é o **do usuário** (`restringirHorario` + faixas por dia da
 * semana, em Administração > Usuários). Quem não tem restrição só respeita os
 * dias úteis — não há horário cadastrado a respeitar.
 */
export interface ExpedienteUsuario {
  restringir: boolean;
  horarios: Pick<UsuarioHorario, 'diaSemana' | 'horaInicio' | 'horaFim'>[];
}

const DIA_MS = 86_400_000;

/** O dia civil (AAAA-MM-DD) de um instante, no fuso da operação. */
export function diaLocal(data: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: HORARIO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(data);
}

/** O relógio de parede do fuso da operação, lido como se fosse UTC. */
function paredeComoUtc(data: Date): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: HORARIO_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(data);
  const v = (t: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(
    v('year'),
    v('month') - 1,
    v('day'),
    v('hour'),
    v('minute'),
    v('second'),
  );
}

/**
 * O instante em que o relógio do fuso da operação marca `hhmm` no `dia`.
 *
 * Duas passadas na correção do deslocamento: a primeira acerta o offset do
 * chute; a segunda cobre o dia em que o offset muda (horário de verão).
 */
export function instanteLocal(dia: string, hhmm: string): Date {
  const [ano, mes, dd] = dia.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const alvo = Date.UTC(ano, mes - 1, dd, hh, mm);
  let utc = alvo;
  for (let i = 0; i < 2; i++) {
    utc = alvo - (paredeComoUtc(new Date(utc)) - utc);
  }
  return new Date(utc);
}

const diaSemanaDe = (dia: string) => new Date(`${dia}T00:00:00Z`).getUTCDay();
const proximoDia = (dia: string) =>
  new Date(new Date(`${dia}T00:00:00Z`).getTime() + DIA_MS)
    .toISOString()
    .slice(0, 10);

/**
 * Leva `data` ao primeiro momento válido: dia útil e, para quem tem expediente
 * restrito, dentro da faixa do dia. Já válida, volta igual.
 *
 * - **Sem restrição de horário:** só os dias úteis contam, e a hora do dia é
 *   mantida (sábado 10:00 vira segunda 10:00).
 * - **Com restrição:** antes do início, vai para o início da faixa do mesmo
 *   dia; no fim da faixa ou depois, para o início do próximo dia útil com
 *   expediente. Dia da semana sem faixa cadastrada não tem expediente.
 */
export function ajustarAoExpediente(
  data: Date,
  calendario: CalendarioUtil,
  expediente: ExpedienteUsuario | null,
): Date {
  if (!expediente?.restringir) return calendario.ajustar(data);

  let atual = new Date(data);
  for (let i = 0; i < 370; i++) {
    const dia = diaLocal(atual);
    const faixa = expediente.horarios.find(
      (h) => h.diaSemana === diaSemanaDe(dia),
    );
    if (!calendario.util(dia) || !faixa) {
      atual = instanteLocal(proximoDia(dia), '00:00');
      continue;
    }
    const { hora } = momentoLocal(atual);
    if (hora < faixa.horaInicio) return instanteLocal(dia, faixa.horaInicio);
    if (hora >= faixa.horaFim) {
      atual = instanteLocal(proximoDia(dia), '00:00');
      continue;
    }
    return atual;
  }
  throw new Error('Sem dia útil com expediente nos próximos 370 dias');
}

/** O expediente cadastrado de um usuário; `null` quando o usuário não existe. */
export async function carregarExpedienteUsuario(
  tx: TenantTx,
  usuarioId: string | null | undefined,
): Promise<ExpedienteUsuario | null> {
  if (!usuarioId) return null;
  const usuario = await tx.usuario.findUnique({
    where: { id: usuarioId },
    select: {
      restringirHorario: true,
      horarios: {
        select: { diaSemana: true, horaInicio: true, horaFim: true },
      },
    },
  });
  if (!usuario) return null;
  return { restringir: usuario.restringirHorario, horarios: usuario.horarios };
}
