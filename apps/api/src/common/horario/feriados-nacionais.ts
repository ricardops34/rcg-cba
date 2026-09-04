/**
 * Feriados nacionais brasileiros de um ano.
 *
 * Função pura, sem banco: recebe o ano, devolve as datas. É o que permite
 * testá-la contra anos conhecidos sem subir nada.
 *
 * **Não inclui ponto facultativo** (a quarta-feira de cinzas até as 14h, por
 * exemplo) nem feriado municipal ou estadual: esses variam por cidade e
 * entram no cadastro manual da empresa.
 */

export type OrigemFeriadoNacional = 'nacional_fixo' | 'nacional_movel';

export interface FeriadoNacional {
  /** Data no calendário local, sem hora — "AAAA-MM-DD". */
  data: string;
  nome: string;
  origem: OrigemFeriadoNacional;
}

/** Data fixa no calendário, todo ano no mesmo dia. */
const FIXOS: { mes: number; dia: number; nome: string }[] = [
  { mes: 1, dia: 1, nome: 'Confraternização Universal' },
  { mes: 4, dia: 21, nome: 'Tiradentes' },
  { mes: 5, dia: 1, nome: 'Dia do Trabalho' },
  { mes: 9, dia: 7, nome: 'Independência do Brasil' },
  { mes: 10, dia: 12, nome: 'Nossa Senhora Aparecida' },
  { mes: 11, dia: 2, nome: 'Finados' },
  { mes: 11, dia: 15, nome: 'Proclamação da República' },
  // Nacional desde a Lei 14.759/2023 — antes disso era feriado só em parte dos
  // municípios. Vale para os anos que este sistema calcula (do presente em
  // diante), então entra sem ressalva de ano.
  { mes: 11, dia: 20, nome: 'Dia Nacional de Zumbi e da Consciência Negra' },
  { mes: 12, dia: 25, nome: 'Natal' },
];

/**
 * Domingo de Páscoa pelo algoritmo de Meeus/Jones/Butcher (calendário
 * gregoriano).
 *
 * É daqui que saem os três feriados móveis nacionais — todos definidos como um
 * deslocamento em dias a partir dela.
 */
export function domingoDePascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  // UTC porque estas datas são de calendário, não instantes: só o
  // ano/mês/dia importa, e construir no fuso do processo faria o dia mudar
  // conforme o servidor.
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const DIA_MS = 86_400_000;

const iso = (d: Date) => d.toISOString().slice(0, 10);

const somarDias = (d: Date, dias: number) =>
  new Date(d.getTime() + dias * DIA_MS);

/**
 * Todos os feriados nacionais de um ano, ordenados por data.
 *
 * Os móveis são deslocamentos da Páscoa, e é assim que a legislação os define:
 * Carnaval na terça 47 dias antes, Sexta-feira Santa 2 dias antes, Corpus
 * Christi 60 dias depois.
 */
export function feriadosNacionais(ano: number): FeriadoNacional[] {
  const pascoa = domingoDePascoa(ano);

  const moveis: FeriadoNacional[] = [
    { data: iso(somarDias(pascoa, -47)), nome: 'Carnaval', origem: 'nacional_movel' },
    {
      data: iso(somarDias(pascoa, -2)),
      nome: 'Sexta-feira Santa',
      origem: 'nacional_movel',
    },
    {
      data: iso(somarDias(pascoa, 60)),
      nome: 'Corpus Christi',
      origem: 'nacional_movel',
    },
  ];

  const fixos: FeriadoNacional[] = FIXOS.map((f) => ({
    data: iso(new Date(Date.UTC(ano, f.mes - 1, f.dia))),
    nome: f.nome,
    origem: 'nacional_fixo' as const,
  }));

  return [...fixos, ...moveis].sort((a, b) => a.data.localeCompare(b.data));
}
