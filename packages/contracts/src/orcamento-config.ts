import { z } from "zod";

// Parâmetro comercial por empresa: quantos dias após a criação o orçamento
// fica válido por padrão — sugere a "Válido até" ao criar um orçamento
// (o vendedor pode ajustar a data livremente depois).
export const orcamentoConfigSchema = z.object({
  diasValidade: z.number().int().min(1).describe("Dias de validade sugeridos para um novo orçamento"),
  updatedAt: z.string().datetime().describe("Data/hora da última alteração do parâmetro"),
});
export type OrcamentoConfig = z.infer<typeof orcamentoConfigSchema>;

export const orcamentoConfigUpdateSchema = z.object({
  diasValidade: z.number().int().min(1),
});
export type OrcamentoConfigUpdate = z.infer<typeof orcamentoConfigUpdateSchema>;

export const ORCAMENTO_CONFIG_EXAMPLE: OrcamentoConfig = {
  diasValidade: 30,
  updatedAt: "2026-08-05T10:00:00.000Z",
};
