import { z } from "zod";

/**
 * Horário de trabalho por usuário — usado para impedir acesso ao sistema fora
 * do expediente (ver `restringirHorario` no cadastro de usuário).
 *
 * O modelo é uma faixa por dia da semana: cada dia tem, no máximo, um
 * intervalo `horaInicio`–`horaFim`. Dia sem faixa cadastrada = sem acesso
 * naquele dia. A avaliação acontece no servidor, no fuso da operação
 * (America/Campo_Grande) — ver `HORARIO_TIMEZONE` na API.
 */

export const DIAS_SEMANA = [
  { valor: 0, nome: "Domingo", abreviado: "Dom" },
  { valor: 1, nome: "Segunda-feira", abreviado: "Seg" },
  { valor: 2, nome: "Terça-feira", abreviado: "Ter" },
  { valor: 3, nome: "Quarta-feira", abreviado: "Qua" },
  { valor: 4, nome: "Quinta-feira", abreviado: "Qui" },
  { valor: 5, nome: "Sexta-feira", abreviado: "Sex" },
  { valor: 6, nome: "Sábado", abreviado: "Sáb" },
] as const;

/** "HH:MM" em 24h — mesmo formato do <input type="time"> do formulário. */
export const horaSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Informe a hora no formato HH:MM");

export const usuarioHorarioSchema = z.object({
  diaSemana: z
    .number()
    .int()
    .min(0)
    .max(6)
    .describe("0 = domingo … 6 = sábado (mesma numeração de Date.getDay)"),
  horaInicio: horaSchema.describe("Início do expediente, ex.: 08:00"),
  horaFim: horaSchema.describe("Fim do expediente, ex.: 18:00"),
});
export type UsuarioHorario = z.infer<typeof usuarioHorarioSchema>;

/**
 * Corpo de PUT /usuarios/:id/horarios — substitui o conjunto inteiro (mesmo
 * padrão dos itens de orçamento e dos objetivos por categoria).
 *
 * `restringirHorario: false` desliga a trava para o usuário, e é o padrão de
 * quem nunca teve horário cadastrado: sem isso, um cadastro vazio seria
 * indistinguível de "não acessa nunca".
 */
export const usuarioHorariosUpdateSchema = z
  .object({
    restringirHorario: z
      .boolean()
      .describe("Quando false, o usuário acessa a qualquer hora (padrão)"),
    horarios: z.array(usuarioHorarioSchema).max(7).default([]),
  })
  .refine(
    (v) => new Set(v.horarios.map((h) => h.diaSemana)).size === v.horarios.length,
    { message: "Há mais de uma faixa para o mesmo dia da semana", path: ["horarios"] },
  )
  .refine((v) => v.horarios.every((h) => h.horaInicio < h.horaFim), {
    message: "A hora final deve ser maior que a inicial",
    path: ["horarios"],
  })
  .refine((v) => !v.restringirHorario || v.horarios.length > 0, {
    message: "Cadastre ao menos um dia de expediente para restringir o acesso",
    path: ["horarios"],
  });
export type UsuarioHorariosUpdate = z.infer<typeof usuarioHorariosUpdateSchema>;

/** Resposta de GET /usuarios/:id/horarios. */
export const usuarioHorariosSchema = z.object({
  restringirHorario: z.boolean(),
  horarios: z.array(usuarioHorarioSchema),
});
export type UsuarioHorarios = z.infer<typeof usuarioHorariosSchema>;

export const USUARIO_HORARIOS_EXAMPLE: UsuarioHorarios = {
  restringirHorario: true,
  horarios: [
    { diaSemana: 1, horaInicio: "08:00", horaFim: "18:00" },
    { diaSemana: 2, horaInicio: "08:00", horaFim: "18:00" },
    { diaSemana: 3, horaInicio: "08:00", horaFim: "18:00" },
    { diaSemana: 4, horaInicio: "08:00", horaFim: "18:00" },
    { diaSemana: 5, horaInicio: "08:00", horaFim: "17:00" },
    { diaSemana: 6, horaInicio: "08:00", horaFim: "12:00" },
  ],
};

/** Faixa padrão sugerida ao ligar a restrição na tela (seg a sex, comercial). */
export const HORARIO_COMERCIAL_PADRAO: UsuarioHorario[] = [1, 2, 3, 4, 5].map(
  (diaSemana) => ({ diaSemana, horaInicio: "08:00", horaFim: "18:00" }),
);
