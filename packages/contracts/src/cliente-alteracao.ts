import { z } from "zod";
import { paginationQuerySchema } from "./common";

/**
 * Governança do cadastro de cliente: nenhuma origem altera cliente direto.
 * Toda mudança vira uma solicitação com o "de → para", e só depois de aprovada
 * por quem tem `clientes.aprovar` é aplicada e registrada no histórico.
 *
 * Vale inclusive para a API de integração do ERP (decisão de 2026-08-14). Para
 * a fila não encher a cada sincronização, o diff é sempre calculado contra o
 * estado atual do cliente: payload igual ao que já está gravado não gera
 * solicitação nenhuma.
 */

export const origemAlteracaoClienteSchema = z.enum([
  "manual",
  "enriquecimento",
  "integracao",
  "agente",
]);
export type OrigemAlteracaoCliente = z.infer<typeof origemAlteracaoClienteSchema>;

export const ORIGEM_ALTERACAO_CLIENTE_LABEL: Record<OrigemAlteracaoCliente, string> = {
  manual: "Tela de cliente",
  enriquecimento: "Consulta de CNPJ",
  integracao: "Integração ERP",
  agente: "Agente IA",
};

export const statusAlteracaoClienteSchema = z.enum(["pendente", "aprovada", "rejeitada"]);
export type StatusAlteracaoCliente = z.infer<typeof statusAlteracaoClienteSchema>;

export const STATUS_ALTERACAO_CLIENTE_LABEL: Record<StatusAlteracaoCliente, string> = {
  pendente: "Aguardando aprovação",
  aprovada: "Aprovada",
  rejeitada: "Recusada",
};

/** Valor de um campo do cliente como trafega no diff (JSON, já serializado). */
export const valorAlteracaoSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
export type ValorAlteracao = z.infer<typeof valorAlteracaoSchema>;

export const campoAlteradoSchema = z.object({
  de: valorAlteracaoSchema,
  para: valorAlteracaoSchema,
});
export type CampoAlterado = z.infer<typeof campoAlteradoSchema>;

/** `{ limiteCredito: { de: 1000, para: 5000 }, telefone: { de: null, para: "6733..." } }` */
export const diffAlteracaoSchema = z.record(campoAlteradoSchema);
export type DiffAlteracao = z.infer<typeof diffAlteracaoSchema>;

export const clienteAlteracaoSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  clienteId: z.string().uuid(),
  // Desnormalizado para a fila não precisar de uma consulta por linha.
  clienteRazaoSocial: z.string().nullable(),
  clienteCodigoErp: z.string().nullable(),
  origem: origemAlteracaoClienteSchema,
  status: statusAlteracaoClienteSchema,
  alteracoes: diffAlteracaoSchema,
  justificativa: z.string().nullable(),
  solicitadoPor: z.string().nullable(),
  solicitadoPorNome: z.string().nullable(),
  solicitadoEm: z.string().datetime(),
  analisadoPor: z.string().nullable(),
  analisadoPorNome: z.string().nullable(),
  analisadoEm: z.string().datetime().nullable(),
  motivoRecusa: z.string().nullable(),
});
export type ClienteAlteracao = z.infer<typeof clienteAlteracaoSchema>;

export const clienteAlteracaoQuerySchema = paginationQuerySchema.extend({
  status: statusAlteracaoClienteSchema.optional(),
  origem: origemAlteracaoClienteSchema.optional(),
  clienteId: z.string().uuid().optional(),
});
export type ClienteAlteracaoQuery = z.infer<typeof clienteAlteracaoQuerySchema>;

/**
 * Aprovação **campo a campo**: o responsável escolhe o que entra no cadastro.
 *
 * Existe porque uma solicitação raramente é toda certa ou toda errada — a
 * consulta de CNPJ, por exemplo, traz o endereço da Receita junto com um nome
 * fantasia desatualizado. Antes só havia "aprovar tudo" ou "recusar tudo", e o
 * jeito de aceitar metade era recusar e reeditar à mão.
 *
 * Omitir `campos` aprova a solicitação inteira — é o comportamento anterior, e
 * o que a tela envia quando tudo está marcado. O que ficar de fora entra no
 * histórico do cliente como **reprovado**, com quem reprovou: o rastro tem de
 * mostrar que a mudança foi proposta e negada, não que nunca existiu.
 */
export const clienteAlteracaoAprovacaoSchema = z.object({
  campos: z
    .array(z.string())
    .min(1, "Marque ao menos um campo para aprovar")
    .optional()
    .describe("Campos a aplicar. Omitido = aprova a solicitação inteira."),
});
export type ClienteAlteracaoAprovacao = z.infer<
  typeof clienteAlteracaoAprovacaoSchema
>;

export const clienteAlteracaoRecusaSchema = z.object({
  // Obrigatório: recusa sem motivo deixa quem solicitou sem saber o que corrigir.
  motivo: z.string().trim().min(3, "Informe o motivo da recusa").max(500),
});
export type ClienteAlteracaoRecusa = z.infer<typeof clienteAlteracaoRecusaSchema>;

/**
 * Resposta do PATCH /clientes/:id. Discriminada porque o mesmo endpoint agora
 * tem dois desfechos: aplicou (quem tem `clientes.aprovar`) ou enfileirou.
 */
export const clienteUpdateResultadoSchema = z.discriminatedUnion("aplicado", [
  z.object({ aplicado: z.literal(true), cliente: z.unknown() }),
  z.object({ aplicado: z.literal(false), solicitacao: clienteAlteracaoSchema }),
]);
export type ClienteUpdateResultado = z.infer<typeof clienteUpdateResultadoSchema>;

/**
 * O que aconteceu com o campo na análise. `reprovado` é uma linha de histórico
 * que **não** mudou o cadastro: registra que aquele valor foi proposto e negado
 * — sem isso, um campo recusado na aprovação parcial simplesmente sumiria, e
 * ninguém saberia que a Receita já tentou mudar aquele endereço.
 */
export const statusHistoricoClienteSchema = z.enum(["aplicado", "reprovado"]);
export type StatusHistoricoCliente = z.infer<typeof statusHistoricoClienteSchema>;

export const STATUS_HISTORICO_CLIENTE_LABEL: Record<
  StatusHistoricoCliente,
  string
> = {
  aplicado: "Aplicado",
  reprovado: "Reprovado",
};

export const clienteHistoricoSchema = z.object({
  id: z.string().uuid(),
  clienteId: z.string().uuid(),
  alteracaoId: z.string().uuid().nullable(),
  campo: z.string(),
  valorAnterior: z.string().nullable(),
  valorNovo: z.string().nullable(),
  status: statusHistoricoClienteSchema,
  origem: origemAlteracaoClienteSchema,
  autor: z.string().nullable(),
  autorNome: z.string().nullable(),
  criadoEm: z.string().datetime(),
});
export type ClienteHistorico = z.infer<typeof clienteHistoricoSchema>;

/** Rótulo dos campos do cliente na fila e no histórico. */
export const CAMPO_CLIENTE_LABEL: Record<string, string> = {
  // Não é coluna do cliente: é a coleção `cliente_cnaes`, que entra no diff
  // como a lista de códigos separada por vírgula (ver `calcularDiff`).
  cnaes: "Ramo de atividade (CNAE)",
  codigoErp: "Código ERP",
  tipoPessoa: "Tipo de pessoa",
  razaoSocial: "Razão social",
  nomeFantasia: "Nome fantasia",
  cnpjCpf: "CNPJ/CPF",
  inscricaoEstadual: "Inscrição estadual",
  inscricaoMunicipal: "Inscrição municipal",
  contribuinteIcms: "Contribuinte ICMS",
  rg: "RG",
  dataNascimento: "Data de nascimento",
  contato: "Contato",
  email: "E-mail",
  telefone: "Telefone",
  telefone2: "Telefone 2",
  celular: "Celular",
  endereco: "Endereço",
  complemento: "Complemento",
  bairro: "Bairro",
  municipio: "Município",
  uf: "UF",
  cep: "CEP",
  latitude: "Latitude",
  longitude: "Longitude",
  vendedorId: "Vendedor",
  tabelaPrecoId: "Tabela de preço",
  condicaoPagamentoId: "Condição de pagamento",
  ativo: "Ativo",
  carteira: "Carteira",
  site: "Site",
  limiteCredito: "Limite de crédito",
  vencimentoLimite: "Vencimento do limite",
  observacao: "Observação",
  dataBloqueio: "Data de bloqueio",
  observacaoBloqueio: "Observação do bloqueio",
  dataReativacao: "Data de reativação",
  observacaoReativacao: "Observação da reativação",
};

export const CLIENTE_ALTERACAO_EXAMPLE: ClienteAlteracao = {
  id: "3d4e5f60-7182-4930-a4b5-c6d7e8f90112",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  clienteId: "9c8d7e6f-5a4b-4c3d-2e1f-0a9b8c7d6e5f",
  clienteRazaoSocial: "METALÚRGICA XPTO LTDA",
  clienteCodigoErp: "001234",
  origem: "manual",
  status: "pendente",
  alteracoes: {
    limiteCredito: { de: 10000, para: 25000 },
    telefone: { de: null, para: "6733214455" },
  },
  justificativa: null,
  solicitadoPor: "1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9",
  solicitadoPorNome: "João Vendedor",
  solicitadoEm: "2026-08-14T12:00:00.000Z",
  analisadoPor: null,
  analisadoPorNome: null,
  analisadoEm: null,
  motivoRecusa: null,
};
