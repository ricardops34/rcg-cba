import { z } from "zod";
import { clienteCreateSchema } from "./cliente";

// Lista canônica derivada do schema de criação/edição de Cliente — evita
// duplicar os nomes de campo à mão e ficar fora de sincronia se um campo
// novo for adicionado lá.
export const CAMPOS_CLIENTE_CONFIGURAVEIS = Object.keys(clienteCreateSchema.shape) as [
  string,
  ...string[],
];

export const clienteCampoConfigItemSchema = z.object({
  campo: z.enum(CAMPOS_CLIENTE_CONFIGURAVEIS),
  editavel: z.boolean(),
});
export type ClienteCampoConfigItem = z.infer<typeof clienteCampoConfigItemSchema>;

export const clienteCamposConfigUpdateSchema = z.object({
  campos: z.array(clienteCampoConfigItemSchema).min(1),
});
export type ClienteCamposConfigUpdate = z.infer<typeof clienteCamposConfigUpdateSchema>;

// Leitura: mapa campo -> editável (campo sem linha configurada = true).
export const clienteCamposConfigSchema = z.record(z.string(), z.boolean());
export type ClienteCamposConfig = z.infer<typeof clienteCamposConfigSchema>;

export const CLIENTE_CAMPOS_CONFIG_UPDATE_EXAMPLE: ClienteCamposConfigUpdate = {
  campos: [
    { campo: "razaoSocial", editavel: false },
    { campo: "cnpjCpf", editavel: false },
    { campo: "observacao", editavel: true },
  ],
};
