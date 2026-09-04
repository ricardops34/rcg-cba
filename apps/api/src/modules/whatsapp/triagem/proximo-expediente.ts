/** Usado quando a empresa nao configurou fuso — o da operacao original. */
export const FUSO_PADRAO = 'America/Campo_Grande';

/**
 * Quando a empresa volta a atender.
 *
 * Usado quando o cliente escreve fora do expediente: a IA precisa dizer uma
 * data concreta ("terça, a partir das 8h"), e não um "assim que possível" que
 * não compromete ninguém.
 *
 * **O expediente sai dos horários cadastrados**, os mesmos que barram o login
 * fora de hora — não de uma constante. Empresa que atende sábado tem sábado
 * aqui, sem ninguém configurar duas vezes.
 *
 * Quando não há horário cadastrado nenhum (o padrão do sistema é não
 * restringir), cai no comercial clássico: segunda a sexta, a partir das 8h. É
 * um palpite, e está assumido como tal — melhor um palpite explicável do que a
 * IA prometer retorno "a qualquer momento" no domingo à noite.
 */

export interface FaixaExpediente {
  /** 0 = domingo, 6 = sábado. */
  diaSemana: number;
  /** "HH:MM". */
  horaInicio: string;
  horaFim: string;
}

/** Comercial clássico, para quando ninguém cadastrou expediente. */
export const EXPEDIENTE_PADRAO: FaixaExpediente[] = [1, 2, 3, 4, 5].map(
  (diaSemana) => ({ diaSemana, horaInicio: '08:00', horaFim: '18:00' }),
);

const DIAS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

/** Dia da semana e hora local, no fuso da operação. */
function localDe(
  quando: Date,
  tz: string,
): { diaSemana: number; hora: string } {
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const partes = fmt.formatToParts(quando);
  const hora = `${partes.find((p) => p.type === 'hour')?.value ?? '00'}:${
    partes.find((p) => p.type === 'minute')?.value ?? '00'
  }`;
  // `getDay` do Date é do fuso do processo; o container roda em UTC, e no
  // Brasil isso erra o dia entre 21h e meia-noite. Daí ler do formatador.
  const abrev = (partes.find((p) => p.type === 'weekday')?.value ?? '')
    .toLowerCase()
    .slice(0, 3);
  const mapa: Record<string, number> = {
    dom: 0,
    seg: 1,
    ter: 2,
    qua: 3,
    qui: 4,
    sex: 5,
    sáb: 6,
    sab: 6,
  };
  return { diaSemana: mapa[abrev] ?? 0, hora };
}

/**
 * Deslocamento do fuso da operação, em minutos, para um dado instante.
 *
 * Precisa ser calculado por instante, e não fixado: o valor muda se o país
 * voltar a ter horário de verão, e um `-4` constante erraria a hora por uma
 * temporada inteira sem ninguém entender por quê.
 */
function offsetMinutos(quando: Date, tz: string): number {
  const nome = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'longOffset',
  })
    .formatToParts(quando)
    .find((p) => p.type === 'timeZoneName')?.value;
  // Vem como "GMT-04:00"; "GMT" puro significa deslocamento zero.
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(nome ?? '');
  if (!m) return 0;
  const sinal = m[1] === '-' ? -1 : 1;
  return sinal * (Number(m[2]) * 60 + Number(m[3]));
}

/**
 * O instante em que dá "hh:mm do dia X" **no fuso da operação**.
 *
 * `setHours` não serve: ele trabalha no fuso do processo, e o container roda em
 * UTC. Usá-lo faria o vencimento da atividade cair 4 horas mais cedo — o tipo
 * de erro que aparece como "a tarefa venceu de madrugada" e ninguém liga ao
 * código.
 */
function instanteLocal(
  referencia: Date,
  adianteDias: number,
  hhmm: string,
  tz: string,
): Date {
  const off = offsetMinutos(referencia, tz);
  // A data do calendário local, obtida deslocando o instante para o fuso.
  const local = new Date(referencia.getTime() + off * 60_000);
  const ano = local.getUTCFullYear();
  const mes = local.getUTCMonth();
  const dia = local.getUTCDate() + adianteDias;
  const [h, m] = hhmm.split(':').map(Number);
  // Monta em UTC e desfaz o deslocamento: o resultado é o instante real.
  return new Date(Date.UTC(ano, mes, dia, h, m) - off * 60_000);
}

/** "AAAA-MM-DD" do dia local, `adianteDias` à frente — a chave do feriado. */
function dataLocalIso(referencia: Date, adianteDias: number, tz: string): string {
  const off = offsetMinutos(referencia, tz);
  const local = new Date(referencia.getTime() + off * 60_000);
  const d = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate() + adianteDias,
    ),
  );
  return d.toISOString().slice(0, 10);
}

/**
 * O calendário da empresa: quando ela atende, em que fuso, e em que dias não
 * atende.
 *
 * Os três juntos porque nenhum responde sozinho "quando volto a atender": sem
 * o fuso, "18:00" é ambíguo; sem os feriados, a resposta cai no dia 25 de
 * dezembro.
 */
export interface AgendaEmpresa {
  /** IANA. Vazio cai em `FUSO_PADRAO`. */
  fusoHorario: string | null;
  faixas: FaixaExpediente[];
  /** Datas "AAAA-MM-DD" em que não há atendimento. */
  feriados?: string[];
}

export interface ProximoAtendimento {
  /** Dia por extenso, para a IA falar com o cliente. */
  dia: string;
  /** "HH:MM" de abertura naquele dia. */
  hora: string;
  /** Quantos dias à frente: 0 = ainda hoje, 1 = amanhã. */
  emDias: number;
  /** Data/hora do início, para virar vencimento de atividade. */
  quando: Date;
}

/**
 * Próximo momento em que a empresa atende, a partir de `agora`.
 *
 * Se hoje ainda há expediente pela frente, devolve hoje — quem escreve às 7h30
 * de uma terça não precisa esperar até quarta.
 */
export function proximoAtendimento(
  agenda: AgendaEmpresa,
  agora: Date = new Date(),
): ProximoAtendimento {
  const tz = agenda.fusoHorario || FUSO_PADRAO;
  const uteis = agenda.faixas.length > 0 ? agenda.faixas : EXPEDIENTE_PADRAO;
  const feriados = new Set(agenda.feriados ?? []);
  const { diaSemana, hora } = localDe(agora, tz);

  // Uma volta inteira mais uma semana: cobre a emenda de feriado longa (Natal
  // e Ano-Novo caindo no meio da semana) sem laço infinito.
  for (let adiante = 0; adiante <= 14; adiante++) {
    const dia = (diaSemana + adiante) % 7;

    // Feriado é dia sem atendimento, mesmo que a semana diga que é útil. Sem
    // isto a triagem marcaria retorno para o dia 25 de dezembro.
    if (feriados.has(dataLocalIso(agora, adiante, tz))) continue;

    const doDia = uteis
      .filter((f) => f.diaSemana === dia)
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

    for (const faixa of doDia) {
      // Hoje só conta se o expediente ainda não acabou.
      if (adiante === 0 && hora >= faixa.horaFim) continue;
      const comecaEm =
        adiante === 0 && hora >= faixa.horaInicio ? hora : faixa.horaInicio;

      return {
        dia: DIAS[dia],
        hora: faixa.horaInicio,
        emDias: adiante,
        quando: instanteLocal(agora, adiante, comecaEm, tz),
      };
    }
  }

  // Só chega aqui se as faixas não cobrirem dia nenhum da semana — cadastro
  // impossível pela tela, mas o retorno tem de existir.
  return {
    dia: DIAS[(diaSemana + 1) % 7],
    hora: '08:00',
    emDias: 1,
    quando: instanteLocal(agora, 1, '08:00', tz),
  };
}
