import { HORARIO_TIMEZONE } from '../../common/horario/horario-trabalho';

export function dataDoResumo(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: HORARIO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

export function inicioDoDiaOperacional(agora = new Date()) {
  const offset =
    new Intl.DateTimeFormat('en', {
      timeZone: HORARIO_TIMEZONE,
      timeZoneName: 'longOffset',
    })
      .formatToParts(agora)
      .find((p) => p.type === 'timeZoneName')!
      .value.replace('GMT', '') || '+00:00';
  return new Date(`${dataDoResumo(agora)}T00:00:00${offset}`);
}
