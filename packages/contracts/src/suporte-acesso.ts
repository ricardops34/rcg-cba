import { z } from "zod";

export const perfilPlataformaRoleSchema = z.enum([
  "admin_plataforma",
  "financeiro_plataforma",
  "suporte_plataforma",
]);
export type PerfilPlataformaRole = z.infer<typeof perfilPlataformaRoleSchema>;

export const concederSuporteSchema = z.object({
  motivo: z.string().trim().min(5, "Descreva o motivo da liberação do suporte").max(500),
  duracaoHoras: z.coerce.number().int().min(1).max(72).default(4),
});
export type ConcederSuporte = z.infer<typeof concederSuporteSchema>;

export const empresaSuporteAcessoSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  concedidoPorId: z.string().uuid(),
  motivo: z.string(),
  validoAte: z.string(),
  revogadoEm: z.string().nullable().optional(),
  revogadoPorId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  concedidoPor: z
    .object({
      id: z.string().uuid(),
      nome: z.string(),
      email: z.string(),
    })
    .optional(),
});
export type EmpresaSuporteAcesso = z.infer<typeof empresaSuporteAcessoSchema>;

export const empresaSuporteLogSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  suporteAcessoId: z.string().uuid(),
  usuarioPlataformaId: z.string().uuid(),
  metodoHttp: z.string(),
  rota: z.string(),
  payload: z.string().nullable().optional(),
  ip: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  createdAt: z.string(),
  usuarioPlataforma: z
    .object({
      id: z.string().uuid(),
      nome: z.string(),
      email: z.string(),
    })
    .optional(),
});
export type EmpresaSuporteLog = z.infer<typeof empresaSuporteLogSchema>;
