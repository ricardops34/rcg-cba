import { z } from "zod";

export const integracaoEndpointItemSchema = z.object({
  endpointKey: z.string(),
  nome: z.string(),
  descricao: z.string(),
  metodos: z.array(z.string()),
  rota: z.string(),
  ativo: z.boolean(),
  ultimoUso: z.string().datetime().nullable(),
  totalChamadas: z.number().int().min(0),
});
export type IntegracaoEndpointItem = z.infer<typeof integracaoEndpointItemSchema>;

export const integracaoEndpointToggleSchema = z.object({
  ativo: z.boolean(),
});
export type IntegracaoEndpointToggle = z.infer<typeof integracaoEndpointToggleSchema>;
