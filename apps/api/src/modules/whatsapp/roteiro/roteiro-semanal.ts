import type { RoteiroCriterios, RoteiroMotivo } from '@plataforma/contracts';
import type { CalendarioUtil } from '../../../common/horario/calendario-util';
import {
  instanteLocal,
  type ExpedienteUsuario,
} from '../../../common/horario/expediente';
import { momentoLocal } from '../../../common/horario/horario-trabalho';

/**
 * Regras do roteiro semanal, **sem banco**: quem entra, em que ordem e em que
 * horário. O serviço só busca os dados e grava; o que decide está aqui, onde
 * dá para testar com datas fixas.
 * (docs/planos/2026-10-16-agendamentos-whatsapp.md, §7)
 */

const DIA_MS = 86_400_000;

/** O que se sabe de um cliente da carteira, já resumido do banco. */
export interface ClienteMetricas {
  clienteId: string;
  nome: string;
  /** Última venda (sem comodato); nulo se nunca comprou. */
  ultimaCompra: Date | null;
  /** Comprou em algum dia do mês anterior. */
  comprouMesPassado: boolean;
  /** Comprou de 1º do mês até hoje. */
  comprouNoMes: boolean;
  /** Comprou no mesmo intervalo de dias do período, um mês antes. */
  comprouMesmoPeriodoMesPassado: boolean;
  /** Vencimento do título em aberto mais antigo; nulo se não há atraso. */
  tituloVencidoDesde: Date | null;
  valorVencido: number;
}

export interface Candidato {
  clienteId: string;
  nome: string;
  motivos: RoteiroMotivo[];
  detalhe: string | null;
  /** Chave de ordenação: menor vem primeiro. */
  ordem: [number, number];
}

const diasEntre = (de: Date, ate: Date) =>
  Math.floor((ate.getTime() - de.getTime()) / DIA_MS);

const moeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Escolhe e ordena os clientes que atendem aos critérios.
 *
 * Como só se preenche o que há de horário livre, a **ordem importa**: título
 * vencido primeiro (o mais antigo na frente), depois quem está há mais tempo
 * sem comprar, depois quem comprou no mês passado e ainda não neste, e por fim
 * quem comprou no mesmo período do mês passado.
 */
export function selecionarCandidatos(
  clientes: ClienteMetricas[],
  criterios: RoteiroCriterios,
  hoje: Date,
): Candidato[] {
  const candidatos: Candidato[] = [];

  for (const c of clientes) {
    const motivos: RoteiroMotivo[] = [];
    const partes: string[] = [];

    if (criterios.tituloVencido && c.tituloVencidoDesde) {
      motivos.push('titulo_vencido');
      partes.push(
        `${moeda(c.valorVencido)} vencido há ${Math.max(0, diasEntre(c.tituloVencidoDesde, hoje))} dias`,
      );
    }

    const diasSemComprar = c.ultimaCompra
      ? diasEntre(c.ultimaCompra, hoje)
      : null;
    if (
      criterios.semCompraDias &&
      diasSemComprar !== null &&
      diasSemComprar >= criterios.semCompraDias
    ) {
      motivos.push('sem_compra');
      partes.push(`sem comprar há ${diasSemComprar} dias`);
    }

    if (criterios.naoCompraramNoMes && c.comprouMesPassado && !c.comprouNoMes) {
      motivos.push('nao_comprou_no_mes');
      partes.push('comprou no mês passado e ainda não neste');
    }

    if (
      criterios.mesmoPeriodoMesPassado &&
      c.comprouMesmoPeriodoMesPassado &&
      !c.comprouNoMes
    ) {
      motivos.push('mesmo_periodo_mes_passado');
      partes.push('comprou no mesmo período do mês passado');
    }

    if (motivos.length === 0) continue;

    // Grupo (prioridade) e, dentro dele, o mais urgente na frente.
    let ordem: [number, number];
    if (motivos.includes('titulo_vencido') && c.tituloVencidoDesde) {
      ordem = [0, c.tituloVencidoDesde.getTime()];
    } else if (motivos.includes('sem_compra')) {
      ordem = [1, -(diasSemComprar ?? 0)];
    } else if (motivos.includes('nao_comprou_no_mes')) {
      ordem = [2, c.ultimaCompra?.getTime() ?? Number.MAX_SAFE_INTEGER];
    } else {
      ordem = [3, c.ultimaCompra?.getTime() ?? Number.MAX_SAFE_INTEGER];
    }

    candidatos.push({
      clienteId: c.clienteId,
      nome: c.nome,
      motivos,
      detalhe: partes.join(' · ') || null,
      ordem,
    });
  }

  return candidatos.sort(
    (a, b) =>
      a.ordem[0] - b.ordem[0] ||
      a.ordem[1] - b.ordem[1] ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

/** Todos os dias (AAAA-MM-DD) de `inicio` a `fim`, inclusive. */
export function diasDoPeriodo(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  const fimMs = Date.parse(`${fim}T00:00:00Z`);
  for (let t = Date.parse(`${inicio}T00:00:00Z`); t <= fimMs; t += DIA_MS) {
    dias.push(new Date(t).toISOString().slice(0, 10));
  }
  return dias;
}

/** O mesmo dia, um mês antes (31/03 → 28/02: o dia cai no último do mês anterior). */
export function mesmoDiaMesAnterior(dia: string): string {
  const [ano, mes, dd] = dia.split('-').map(Number);
  const ultimoDiaDoMesAnterior = new Date(
    Date.UTC(ano, mes - 1, 0),
  ).getUTCDate();
  const data = new Date(
    Date.UTC(ano, mes - 2, Math.min(dd, ultimoDiaDoMesAnterior)),
  );
  return data.toISOString().slice(0, 10);
}

export interface Ocupado {
  inicio: Date;
  fim: Date;
}

export interface ParametrosHorarios {
  dias: string[];
  calendario: CalendarioUtil;
  /** Expediente cadastrado; sem restrição (ou nulo), vale `padrao`. */
  expediente: ExpedienteUsuario | null;
  padrao: { horaInicio: string; horaFim: string };
  intervaloMin: number;
  ocupados: Ocupado[];
  agora: Date;
  /** Folga mínima a partir de agora, para o vendedor ter tempo de confirmar. */
  antecedenciaMin?: number;
}

/**
 * Os horários **livres** de atendimento no período.
 *
 * Só dias úteis (sem feriado) e dentro do expediente do usuário: quem tem
 * horário cadastrado usa a faixa de cada dia da semana (dia sem faixa não tem
 * atendimento); quem não tem usa o início e o fim informados. Cada
 * atendimento ocupa o intervalo inteiro, e um horário é livre quando nada já
 * marcado na agenda se sobrepõe a ele.
 */
export function gerarHorariosLivres(p: ParametrosHorarios): Date[] {
  const intervaloMs = p.intervaloMin * 60_000;
  const limite = p.agora.getTime() + (p.antecedenciaMin ?? 15) * 60_000;
  const horarios: Date[] = [];

  for (const dia of p.dias) {
    if (!p.calendario.util(dia)) continue;

    let faixa = p.padrao;
    if (p.expediente?.restringir) {
      const semana = new Date(`${dia}T00:00:00Z`).getUTCDay();
      const doDia = p.expediente.horarios.find((h) => h.diaSemana === semana);
      if (!doDia) continue;
      faixa = { horaInicio: doDia.horaInicio, horaFim: doDia.horaFim };
    }

    const inicio = instanteLocal(dia, faixa.horaInicio).getTime();
    const fim = instanteLocal(dia, faixa.horaFim).getTime();
    for (let t = inicio; t + intervaloMs <= fim; t += intervaloMs) {
      if (t < limite) continue;
      const ocupado = p.ocupados.some(
        (o) => o.inicio.getTime() < t + intervaloMs && o.fim.getTime() > t,
      );
      if (!ocupado) horarios.push(new Date(t));
    }
  }
  return horarios;
}

/**
 * O que já está na agenda e ocupa horário: cada compromisso com hora marcada
 * ocupa um intervalo. Compromisso de dia inteiro (00:00) não bloqueia nada.
 */
export function ocupadosDaAgenda(
  compromissos: Date[],
  intervaloMin: number,
): Ocupado[] {
  return compromissos
    .filter((d) => momentoLocal(d).hora !== '00:00')
    .map((d) => ({
      inicio: d,
      fim: new Date(d.getTime() + intervaloMin * 60_000),
    }));
}

/** Um cliente por horário, na ordem; o que sobra fica sem horário. */
export function distribuir<T>(
  candidatos: T[],
  horarios: Date[],
): { alocados: { candidato: T; quando: Date }[]; semHorario: T[] } {
  const alocados = candidatos
    .slice(0, horarios.length)
    .map((candidato, i) => ({ candidato, quando: horarios[i] }));
  return { alocados, semHorario: candidatos.slice(horarios.length) };
}
