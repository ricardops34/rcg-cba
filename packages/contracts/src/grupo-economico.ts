import { z } from "zod";

export const grupoEconomicoInputSchema = z.object({
  descricao: z.string().trim().min(2).max(120),
  empresaIds: z.array(z.string().uuid()).min(1).max(100)
    .refine((ids) => new Set(ids).size === ids.length, "Empresas repetidas"),
});
export type GrupoEconomicoInput = z.infer<typeof grupoEconomicoInputSchema>;

export const grupoUsuarioInputSchema = z.object({
  usuarioId: z.string().uuid().optional(),
  novo: z.object({
    nome: z.string().trim().min(2).max(120),
    email: z.string().trim().email().toLowerCase(),
    senha: z.string().min(1).max(128),
  }).optional(),
  vinculos: z.array(z.object({ empresaId: z.string().uuid(), perfilId: z.string().uuid() }))
    .min(1).max(100).refine((v) => new Set(v.map((e) => e.empresaId)).size === v.length, "Empresas repetidas"),
}).refine((v) => Boolean(v.usuarioId) !== Boolean(v.novo), "Selecione um usuário ou cadastre um novo");
export type GrupoUsuarioInput = z.infer<typeof grupoUsuarioInputSchema>;
export interface GrupoEmpresa { id: string; nomeFantasia: string; cnpj: string; grupoEconomicoId: string | null }
export interface GrupoEconomico { id: string; descricao: string; empresas: GrupoEmpresa[] }
export interface GrupoContexto { grupos: GrupoEconomico[]; empresasDisponiveis: GrupoEmpresa[]; podeCriarGrupo: boolean }
export interface GrupoUsuario { id: string; nome: string; email: string; vinculos: { empresaId: string; perfilId: string; ativo: boolean }[] }
