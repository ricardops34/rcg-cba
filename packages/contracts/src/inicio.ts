import { z } from "zod";
import { booleanQueryParam, paginationQuerySchema } from "./common";

/**
 * Tela inicial (Início) — o que o usuário vê ao entrar no sistema.
 *
 * São três blocos, e cada um tem dono diferente: os **atalhos** são estáticos
 * no frontend (filtrados por permissão, sem ida ao servidor), os
 * **aniversariantes** saem do cadastro de vendedores e os **comunicados** de
 * um cadastro próprio, mantido em Administração.
 */

/* ------------------------------- Comunicados ------------------------------ */

export const comunicadoSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  titulo: z.string(),
  texto: z.string(),
  inicioEm: z.string().datetime(),
  fimEm: z.string().datetime().nullable(),
  fixado: z.boolean(),
  ativo: z.boolean(),
  /**
   * Perfis que enxergam. **Vazio = todos** — é o caso comum, e obrigar a
   * marcar todos faria o cadastro errar por omissão: perfil criado depois não
   * veria nada.
   */
  perfisIds: z.array(z.string().uuid()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Comunicado = z.infer<typeof comunicadoSchema>;

export const comunicadoCreateSchema = z.object({
  titulo: z.string().trim().min(1, "Informe o título").max(120),
  texto: z.string().trim().min(1, "Informe o texto"),
  // Coerção porque o formulário manda string de <input type="datetime-local">.
  inicioEm: z.coerce.date().optional(),
  fimEm: z.coerce.date().nullable().optional(),
  fixado: z.boolean().optional(),
  ativo: z.boolean().optional(),
  perfisIds: z.array(z.string().uuid()).optional(),
});
export type ComunicadoCreate = z.infer<typeof comunicadoCreateSchema>;

export const comunicadoUpdateSchema = comunicadoCreateSchema.partial();
export type ComunicadoUpdate = z.infer<typeof comunicadoUpdateSchema>;

export const comunicadoQuerySchema = paginationQuerySchema.extend({
  ativo: booleanQueryParam,
});
export type ComunicadoQuery = z.infer<typeof comunicadoQuerySchema>;

/** Linha do mural: o que a tela inicial mostra, sem os campos de cadastro. */
export const comunicadoMuralSchema = z.object({
  id: z.string().uuid(),
  titulo: z.string(),
  texto: z.string(),
  fixado: z.boolean(),
  /** Data de publicação — é o `inicioEm`, que é o que vale para o leitor. */
  publicadoEm: z.string().datetime(),
});
export type ComunicadoMural = z.infer<typeof comunicadoMuralSchema>;

/* ----------------------------- Aniversariantes ---------------------------- */

export const aniversarianteSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  /** Dia e mês, 1-based. O **ano não sai da API**: ninguém precisa da idade. */
  dia: z.number().int().min(1).max(31),
  mes: z.number().int().min(1).max(12),
  /** Quantos dias faltam; 0 = hoje. Ordena a lista e destaca o dia. */
  emDias: z.number().int().min(0),
});
export type Aniversariante = z.infer<typeof aniversarianteSchema>;

export const ANIVERSARIANTES_JANELA_DIAS = 30;
