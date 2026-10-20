import { z } from "zod";
import { clienteCreateSchema } from "./cliente";

// Lista canônica derivada do schema de criação/edição de Cliente — evita
// duplicar os nomes de campo à mão e ficar fora de sincronia se um campo
// novo for adicionado lá.
export const CAMPOS_CLIENTE_CONFIGURAVEIS = [
  ...(Object.keys(clienteCreateSchema.shape) as [string, ...string[]]),
  // `cnaes` não é coluna do cliente — é a coleção de ramos de atividade, que
  // grava por conta própria (`cliente_cnaes`). Entra aqui porque a pergunta
  // "quem pode mexer nisso?" é a mesma dos outros campos, e a seção de CNAE do
  // formulário respeita esta chave como respeita as demais.
  "cnaes",
] as [string, ...string[]];

/**
 * Quem pode mexer no campo:
 * - `permitir`: edita sempre;
 * - `bloquear`: somente leitura;
 * - `se_vazio`: edita enquanto o cadastro não tem valor — depois de preenchido,
 *   trava (só quem aprova, pela fila de alterações, muda).
 */
export const MODOS_CAMPO_CLIENTE = ["permitir", "bloquear", "se_vazio"] as const;
export const modoCampoClienteSchema = z.enum(MODOS_CAMPO_CLIENTE);
export type ModoCampoCliente = z.infer<typeof modoCampoClienteSchema>;

export const MODO_CAMPO_CLIENTE_LABEL: Record<ModoCampoCliente, string> = {
  permitir: "Permitir",
  bloquear: "Bloquear",
  se_vazio: "Permitir se vazio",
};

export const clienteCampoConfigItemSchema = z.object({
  campo: z.enum(CAMPOS_CLIENTE_CONFIGURAVEIS),
  modo: modoCampoClienteSchema,
});
export type ClienteCampoConfigItem = z.infer<typeof clienteCampoConfigItemSchema>;

export const clienteCamposConfigUpdateSchema = z.object({
  campos: z.array(clienteCampoConfigItemSchema).min(1),
});
export type ClienteCamposConfigUpdate = z.infer<typeof clienteCamposConfigUpdateSchema>;

// Leitura: mapa campo -> modo (campo sem linha configurada = "permitir").
export const clienteCamposConfigSchema = z.record(z.string(), modoCampoClienteSchema);
export type ClienteCamposConfig = z.infer<typeof clienteCamposConfigSchema>;

/**
 * O campo está travado agora? `valorAtual` é o que o cadastro tem hoje; só o
 * modo `se_vazio` olha para ele.
 */
export function campoClienteTravado(
  config: ClienteCamposConfig | undefined,
  campo: string,
  valorAtual: unknown,
): boolean {
  const modo = config?.[campo] ?? "permitir";
  if (modo === "permitir") return false;
  if (modo === "bloquear") return true;
  return !(
    valorAtual == null ||
    valorAtual === "" ||
    (Array.isArray(valorAtual) && valorAtual.length === 0)
  );
}

export const CLIENTE_CAMPOS_CONFIG_UPDATE_EXAMPLE: ClienteCamposConfigUpdate = {
  campos: [
    { campo: "razaoSocial", modo: "bloquear" },
    { campo: "cnpjCpf", modo: "bloquear" },
    { campo: "telefone", modo: "se_vazio" },
    { campo: "observacao", modo: "permitir" },
  ],
};
