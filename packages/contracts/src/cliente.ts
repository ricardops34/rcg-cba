import { z } from "zod";
import { auditFieldsSchema } from "./common";

const opt = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const clienteCreateSchema = z.object({
  razaoSocial: z.string().trim().min(1, "Informe a razão social").max(120),
  nomeFantasia: opt(80),
  codigoErp: opt(20),
  cnpjCpf: opt(20),
  inscricaoEstadual: opt(20),
  colaboradorId: z
    .string()
    .uuid()
    .nullable()
    .default(null)
    .describe("Vendedor responsável pela carteira deste cliente"),
  contato: opt(60),
  email: z.string().trim().email("E-mail inválido").max(120).optional().or(z.literal("")),
  telefone: opt(20),
  celular: opt(20),
  endereco: opt(120),
  bairro: opt(60),
  municipio: opt(60),
  uf: opt(2),
  cep: opt(9),
  ativo: z.boolean().default(true),
});
export type ClienteCreate = z.infer<typeof clienteCreateSchema>;

export const clienteUpdateSchema = clienteCreateSchema.partial();
export type ClienteUpdate = z.infer<typeof clienteUpdateSchema>;

export const clienteSchema = clienteCreateSchema.extend({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  ...auditFieldsSchema.shape,
});
export type Cliente = z.infer<typeof clienteSchema>;

export const CLIENTE_CREATE_EXAMPLE: ClienteCreate = {
  razaoSocial: "Supermercado Central Ltda",
  nomeFantasia: "Central",
  codigoErp: "00822501",
  cnpjCpf: "23679594000104",
  inscricaoEstadual: "",
  colaboradorId: null,
  contato: "Ronaldo",
  email: "compras@central.com",
  telefone: "6733411900",
  celular: "",
  endereco: "R. Souto Maior, 751",
  bairro: "Tijuca",
  municipio: "Campo Grande",
  uf: "MS",
  cep: "79050080",
  ativo: true,
};
