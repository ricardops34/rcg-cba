import { z } from "zod";

/**
 * Contato do cliente — a **pessoa**. É o mesmo cadastro que dá acesso ao Portal
 * do Cliente e que o WhatsApp vincula ao número: quem conversa, quem aprova
 * orçamento e quem recebe segunda via são o mesmo registro.
 */
export const clienteContatoSchema = z.object({
  id: z.string().uuid(),
  clienteId: z.string().uuid(),
  nome: z.string(),
  email: z.string(),
  telefone: z.string().nullable(),
  celular: z.string().nullable(),
  cargo: z.string().nullable(),
  principal: z.boolean(),
  ativo: z.boolean(),
  /** Tem credencial do portal — a tela mostra quem já entra e quem não. */
  temAcessoPortal: z.boolean(),
});
export type ClienteContato = z.infer<typeof clienteContatoSchema>;

export const clienteContatoCreateSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  telefone: z.string().trim().max(30).nullable().optional(),
  celular: z.string().trim().max(30).nullable().optional(),
  cargo: z.string().trim().max(80).nullable().optional(),
  principal: z.boolean().default(false),
});
export type ClienteContatoCreate = z.infer<typeof clienteContatoCreateSchema>;
