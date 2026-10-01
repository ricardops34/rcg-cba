import type { TenantTx } from '../prisma/prisma.service';
import { HORARIO_TIMEZONE } from './horario-trabalho';

const DIA = 86_400_000;
const dataLocal = (data: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: HORARIO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(data);

/** Datas financeiras são civis UTC; compromissos são instantes no fuso operacional. */
export class CalendarioUtil {
  private readonly feriados: Set<string>;
  constructor(datas: string[]) {
    this.feriados = new Set(datas);
  }
  util(dia: string) {
    const semana = new Date(`${dia}T00:00:00Z`).getUTCDay();
    return semana !== 0 && semana !== 6 && !this.feriados.has(dia);
  }
  ajustar(data: Date, civil = false): Date {
    const resultado = new Date(data);
    for (let i = 0; i < 370; i++) {
      if (
        this.util(
          civil ? resultado.toISOString().slice(0, 10) : dataLocal(resultado),
        )
      )
        return resultado;
      resultado.setTime(resultado.getTime() + DIA);
    }
    throw new Error('Calendário sem dia útil nos próximos 370 dias');
  }
  vencimento(data: Date | null) {
    return data ? this.ajustar(data, true) : null;
  }
  /** Vencimentos originais anteriores a este corte já venceram após o ajuste. */
  corteVencidos(hoje: Date): Date {
    const anterior = new Date(hoje);
    for (let i = 0; i < 370; i++) {
      anterior.setTime(anterior.getTime() - DIA);
      if (this.util(anterior.toISOString().slice(0, 10)))
        return new Date(anterior.getTime() + DIA);
    }
    throw new Error('Calendário sem dia útil nos últimos 370 dias');
  }
}

export async function carregarCalendarioUtil(tx: TenantTx, empresaId: string) {
  const feriados = await tx.feriado.findMany({
    where: { empresaId },
    select: { data: true },
  });
  return new CalendarioUtil(
    feriados.map((f) => f.data.toISOString().slice(0, 10)),
  );
}
