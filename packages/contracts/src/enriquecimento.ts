import { z } from "zod";

/**
 * Consultas a fontes públicas que **sugerem** dados de cadastro: MinhaReceita
 * (base da Receita Federal) para CNPJ e ViaCEP para endereço.
 *
 * Nenhuma delas grava: o retorno é uma sugestão que a tela mostra ao usuário.
 * O que ele aceitar vira uma solicitação de alteração do cliente — nada entra
 * no cadastro sem passar pela aprovação.
 */

/** CNAE devolvido pela consulta, já casado (ou não) com a referência local. */
export const cnaeSugeridoSchema = z.object({
  codigo: z.string().describe("Subclasse CNAE, só dígitos (ex.: 4639701)"),
  descricao: z.string(),
  principal: z.boolean(),
  // Null quando o código não existe na referência `cnaes` — o front avisa em
  // vez de deixar o usuário achar que salvou. Costuma significar sync do IBGE
  // desatualizado.
  cnaeId: z
    .string()
    .uuid()
    .nullable()
    .describe("Id na referência local, ou null se o código não foi encontrado"),
});
export type CnaeSugerido = z.infer<typeof cnaeSugeridoSchema>;

export const consultaCnpjResultadoSchema = z.object({
  cnpj: z.string(),
  razaoSocial: z.string(),
  nomeFantasia: z.string().nullable(),
  situacaoCadastral: z.string().nullable().describe("Ex.: ATIVA, BAIXADA, SUSPENSA"),
  dataSituacaoCadastral: z.string().nullable(),

  endereco: z.string().nullable(),
  complemento: z.string().nullable(),
  bairro: z.string().nullable(),
  municipio: z.string().nullable(),
  municipioId: z
    .string()
    .uuid()
    .nullable()
    .describe("Município da referência local, resolvido pelo código IBGE"),
  uf: z.string().nullable(),
  cep: z.string().nullable(),

  telefone: z.string().nullable(),
  telefone2: z.string().nullable(),
  email: z.string().nullable(),

  cnaes: z.array(cnaeSugeridoSchema),
});
export type ConsultaCnpjResultado = z.infer<typeof consultaCnpjResultadoSchema>;

export const consultaCepResultadoSchema = z.object({
  cep: z.string(),
  endereco: z.string().nullable(),
  bairro: z.string().nullable(),
  municipio: z.string().nullable(),
  municipioId: z.string().uuid().nullable(),
  uf: z.string().nullable(),
  estadoId: z.string().uuid().nullable(),
  // A segunda consulta do mesmo CEP sai do nosso banco, sem HTTP externo.
  origem: z.enum(["cache", "viacep"]).describe("De onde veio o resultado"),
});
export type ConsultaCepResultado = z.infer<typeof consultaCepResultadoSchema>;

export const CONSULTA_CNPJ_EXAMPLE: ConsultaCnpjResultado = {
  cnpj: "34028316000103",
  razaoSocial: "EMPRESA BRASILEIRA DE CORREIOS E TELEGRAFOS",
  nomeFantasia: "CORREIOS",
  situacaoCadastral: "ATIVA",
  dataSituacaoCadastral: "2005-11-03",
  endereco: "SBN QUADRA 1 BLOCO A, 1",
  complemento: "EDIFICIO SEDE",
  bairro: "ASA NORTE",
  municipio: "Brasília",
  municipioId: "3f2a1b0c-9d8e-4f70-8a1b-2c3d4e5f6071",
  uf: "DF",
  cep: "70002900",
  telefone: "6134261000",
  telefone2: null,
  email: "presidencia@correios.com.br",
  cnaes: [
    {
      codigo: "5310501",
      descricao: "ATIVIDADES DO CORREIO NACIONAL",
      principal: true,
      cnaeId: "7a8b9c0d-1e2f-4a3b-4c5d-6e7f8091a2b3",
    },
  ],
};

export const CONSULTA_CEP_EXAMPLE: ConsultaCepResultado = {
  cep: "79002000",
  endereco: "Rua Quinze de Novembro",
  bairro: "Centro",
  municipio: "Campo Grande",
  municipioId: "8c7b6a59-4d3e-42f1-b0a9-8c7b6a594d3e",
  uf: "MS",
  estadoId: "1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9",
  origem: "viacep",
};
