import { z } from "zod";

/**
 * Política de senha vigente — **somente leitura**.
 *
 * Até 2026-08-26 isto era uma tabela singleton global com tela própria e
 * contrato de update. A edição virou parâmetro **por empresa** (Administração
 * > Parâmetros, uma linha por chave `SENHA_*`), então aqui sobrou só o formato
 * que a API devolve para as telas de senha montarem os requisitos e o schema
 * de validação — quem grava é a tela de Parâmetros.
 *
 * Zero é "sem limite" nos campos que liberam (`tamanhoMaximo`,
 * `diasParaExpirar`) e "não valida" em `historicoQuantidade`. É o mesmo
 * significado que o valor tem no parâmetro, que é sempre número — por isso
 * `null` não aparece mais neste contrato.
 */
export const politicaSenhaSchema = z.object({
  tamanhoMinimo: z
    .number()
    .int()
    .min(1)
    .describe("Tamanho mínimo exigido para a senha"),
  tamanhoMaximo: z
    .number()
    .int()
    .min(0)
    .describe("Tamanho máximo permitido (0 = sem limite)"),
  exigirMaiuscula: z.boolean().describe("Exige ao menos uma letra maiúscula"),
  exigirMinuscula: z.boolean().describe("Exige ao menos uma letra minúscula"),
  exigirNumero: z.boolean().describe("Exige ao menos um dígito numérico"),
  exigirEspecial: z
    .boolean()
    .describe("Exige ao menos um caractere especial (não alfanumérico)"),
  diasParaExpirar: z
    .number()
    .int()
    .min(0)
    .describe("Dias após a última troca até a senha expirar (0 = nunca expira)"),
  historicoQuantidade: z
    .number()
    .int()
    .min(0)
    .describe(
      "Quantidade de senhas anteriores que não podem ser reutilizadas (0 = não valida reuso)",
    ),
  tentativasAntesBloqueio: z
    .number()
    .int()
    .min(1)
    .describe("Tentativas de login falhas antes de bloquear a conta"),
  minutosBloqueio: z
    .number()
    .int()
    .min(1)
    .describe("Duração do bloqueio, em minutos, após exceder as tentativas"),
});
export type PoliticaSenha = z.infer<typeof politicaSenhaSchema>;

export const POLITICA_SENHA_EXAMPLE: PoliticaSenha = {
  tamanhoMinimo: 8,
  tamanhoMaximo: 0,
  exigirMaiuscula: true,
  exigirMinuscula: false,
  exigirNumero: true,
  exigirEspecial: false,
  diasParaExpirar: 0,
  historicoQuantidade: 0,
  tentativasAntesBloqueio: 5,
  minutosBloqueio: 15,
};
