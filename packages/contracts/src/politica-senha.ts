import { z } from "zod";

// Parâmetros globais de política de senha da plataforma — singleton (não é
// escopado por empresa: Usuario é global e loga em várias empresas com a
// mesma senha, então a regra vale para o sistema inteiro).
export const politicaSenhaSchema = z.object({
  tamanhoMinimo: z.number().int().min(1).describe("Tamanho mínimo exigido para a senha"),
  tamanhoMaximo: z
    .number()
    .int()
    .nullable()
    .describe("Tamanho máximo permitido, ou null se não houver limite"),
  exigirMaiuscula: z.boolean().describe("Exige ao menos uma letra maiúscula"),
  exigirMinuscula: z.boolean().describe("Exige ao menos uma letra minúscula"),
  exigirNumero: z.boolean().describe("Exige ao menos um dígito numérico"),
  exigirEspecial: z.boolean().describe("Exige ao menos um caractere especial (não alfanumérico)"),
  diasParaExpirar: z
    .number()
    .int()
    .nullable()
    .describe("Dias após a última troca até a senha expirar, ou null/0 se nunca expira"),
  historicoQuantidade: z
    .number()
    .int()
    .min(0)
    .describe("Quantidade de senhas anteriores que não podem ser reutilizadas (0 = não valida reuso)"),
  tentativasAntesBloqueio: z
    .number()
    .int()
    .min(1)
    .describe("Número de tentativas de login falhas antes de bloquear a conta"),
  minutosBloqueio: z
    .number()
    .int()
    .min(1)
    .describe("Duração do bloqueio, em minutos, após exceder as tentativas"),
  updatedAt: z.string().datetime().describe("Data/hora da última alteração dos parâmetros"),
});
export type PoliticaSenha = z.infer<typeof politicaSenhaSchema>;

export const politicaSenhaUpdateSchema = politicaSenhaSchema
  .omit({ updatedAt: true })
  .partial()
  .refine(
    (v) =>
      v.tamanhoMaximo == null || v.tamanhoMinimo == null || v.tamanhoMaximo >= v.tamanhoMinimo,
    {
      message: "Tamanho máximo não pode ser menor que o tamanho mínimo",
      path: ["tamanhoMaximo"],
    },
  );
export type PoliticaSenhaUpdate = z.infer<typeof politicaSenhaUpdateSchema>;

export const POLITICA_SENHA_EXAMPLE: PoliticaSenha = {
  tamanhoMinimo: 8,
  tamanhoMaximo: null,
  exigirMaiuscula: true,
  exigirMinuscula: false,
  exigirNumero: true,
  exigirEspecial: false,
  diasParaExpirar: null,
  historicoQuantidade: 0,
  tentativasAntesBloqueio: 5,
  minutosBloqueio: 15,
  updatedAt: "2026-07-08T00:47:25.545Z",
};
