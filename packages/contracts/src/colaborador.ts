import { z } from "zod";
import { auditFieldsSchema } from "./common";

export const cargoSchema = z
  .enum(["diretor", "gerente", "supervisor", "vendedor"])
  .describe("Nível hierárquico do colaborador na estrutura comercial");
export type Cargo = z.infer<typeof cargoSchema>;

export const colaboradorCreateSchema = z.object({
  usuarioId: z
    .string()
    .uuid()
    .describe("Usuário do sistema que este colaborador representa"),
  superiorId: z
    .string()
    .uuid()
    .nullable()
    .default(null)
    .describe("Colaborador superior na hierarquia (líder direto); null se for o topo"),
  cargo: cargoSchema,
  codigoErp: z
    .string()
    .trim()
    .max(40)
    .optional()
    .describe("Código do vendedor no ERP de origem (ex.: Protheus), usado para conciliar vendas importadas"),
  nomeReduzido: z
    .string()
    .trim()
    .max(60)
    .optional()
    .describe("Nome curto/apelido usado em listagens e relatórios (ex.: 'CARLOS' em vez do nome completo)"),
  ativo: z.boolean().default(true).describe("Colaboradores inativos saem dos relatórios e da hierarquia ativa"),
});
export type ColaboradorCreate = z.infer<typeof colaboradorCreateSchema>;

export const colaboradorUpdateSchema = colaboradorCreateSchema
  .omit({ usuarioId: true })
  .partial();
export type ColaboradorUpdate = z.infer<typeof colaboradorUpdateSchema>;

export const colaboradorSchema = colaboradorCreateSchema.extend({
  id: z.string().uuid().describe("Identificador único do colaborador (UUID v4)"),
  empresaId: z.string().uuid().describe("Empresa à qual o colaborador pertence"),
  ...auditFieldsSchema.shape,
});
export type Colaborador = z.infer<typeof colaboradorSchema>;

export const COLABORADOR_CREATE_EXAMPLE: ColaboradorCreate = {
  usuarioId: "827167a9-93f9-4fd8-9cc5-dcd8077c600d",
  superiorId: null,
  cargo: "vendedor",
  codigoErp: "000315",
  nomeReduzido: "CARLOS",
  ativo: true,
};

export const COLABORADOR_EXAMPLE: Colaborador = {
  ...COLABORADOR_CREATE_EXAMPLE,
  id: "27d0545c-106a-4cbd-bd66-3ca7a57cfc28",
  empresaId: "2113ce67-5cf9-40e6-b1ed-fa88281c2a92",
  createdAt: "2026-07-08T00:53:15.641Z",
  updatedAt: "2026-07-08T00:53:15.641Z",
  createdBy: "827167a9-93f9-4fd8-9cc5-dcd8077c600d",
  updatedBy: "827167a9-93f9-4fd8-9cc5-dcd8077c600d",
};
