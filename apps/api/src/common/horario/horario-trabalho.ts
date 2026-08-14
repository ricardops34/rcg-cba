import { ForbiddenException } from '@nestjs/common';
import { DIAS_SEMANA, type UsuarioHorario } from '@plataforma/contracts';

/**
 * Código repassado no corpo do 403 para o front distinguir "fora do
 * expediente" de uma falta de permissão comum: no primeiro caso a sessão
 * acabou e a tela precisa voltar ao login com o aviso, em vez de só mostrar
 * um toast de acesso negado (ver api-client.ts).
 */
export const CODIGO_FORA_HORARIO = 'FORA_HORARIO';

export class ForaDoExpedienteException extends ForbiddenException {
  constructor(motivo: string) {
    super({ message: motivo, codigo: CODIGO_FORA_HORARIO });
  }
}

/**
 * Fuso da operação. O expediente cadastrado ("08:00–18:00") é hora de parede
 * em Campo Grande, não UTC — avaliar em UTC deslocaria a janela em 4 horas e
 * liberaria/barraria o usuário na hora errada.
 *
 * Constante de propósito: hoje toda a operação é MS. Virando parâmetro por
 * empresa, o lugar de trocar é aqui e em quem chama `dentroDoExpediente`.
 */
export const HORARIO_TIMEZONE = 'America/Campo_Grande';

/**
 * Dia da semana (0 = domingo) e hora "HH:MM" de um instante, já convertidos
 * para o fuso da operação.
 *
 * Usa Intl em vez de aritmética com offset porque o offset muda (horário de
 * verão pode voltar a existir) e porque não há dependência de biblioteca de
 * fuso no projeto — o ICU do Node já resolve.
 */
export function momentoLocal(agora: Date = new Date()): {
  diaSemana: number;
  hora: string;
} {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: HORARIO_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(agora);

  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? '';

  const nomes = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // "24" aparece à meia-noite em algumas versões do ICU com hour12: false.
  const hora = valor('hour') === '24' ? '00' : valor('hour');
  return {
    diaSemana: Math.max(0, nomes.indexOf(valor('weekday'))),
    hora: `${hora}:${valor('minute')}`,
  };
}

/** Rótulo curto da faixa de um dia, para a mensagem de acesso negado. */
export function descreverFaixa(horario: UsuarioHorario) {
  const dia = DIAS_SEMANA.find((d) => d.valor === horario.diaSemana);
  return `${dia?.abreviado ?? '?'} ${horario.horaInicio}–${horario.horaFim}`;
}

export interface ResultadoExpediente {
  dentro: boolean;
  /** Mensagem pronta para o usuário quando `dentro` é false. */
  motivo: string;
}

/**
 * Decide se `agora` cai dentro do expediente cadastrado.
 *
 * Regras:
 * - `restringir` desligado libera sempre (é o padrão de quem não tem controle
 *   de horário);
 * - dia sem faixa cadastrada = não acessa naquele dia;
 * - a comparação é textual ("08:00" <= "14:37" < "18:00"), o que funciona
 *   porque o formato é HH:MM zero-padded e de largura fixa;
 * - a faixa é fechada no início e aberta no fim: às 18:00 em ponto, o
 *   expediente que termina às 18:00 já acabou.
 *
 * Faixa que atravessa a meia-noite (ex.: 22:00–02:00) não é suportada — o
 * cadastro recusa horaFim <= horaInicio (ver usuarioHorariosUpdateSchema).
 */
export function dentroDoExpediente(
  restringir: boolean,
  horarios: UsuarioHorario[],
  agora: Date = new Date(),
): ResultadoExpediente {
  if (!restringir) return { dentro: true, motivo: '' };

  const { diaSemana, hora } = momentoLocal(agora);
  const doDia = horarios.find((h) => h.diaSemana === diaSemana);
  const nomeDia =
    DIAS_SEMANA.find((d) => d.valor === diaSemana)?.nome ?? 'hoje';

  if (!doDia) {
    return {
      dentro: false,
      motivo: `Sem expediente cadastrado para ${nomeDia.toLowerCase()}`,
    };
  }
  if (hora < doDia.horaInicio || hora >= doDia.horaFim) {
    return {
      dentro: false,
      motivo:
        `Fora do expediente (${nomeDia.toLowerCase()}, ` +
        `${doDia.horaInicio}–${doDia.horaFim}; agora são ${hora})`,
    };
  }
  return { dentro: true, motivo: '' };
}
