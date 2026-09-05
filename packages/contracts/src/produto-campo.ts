import { z } from "zod";

/**
 * Campos complementares de produto.
 *
 * Duas coisas diferentes moram aqui: a **definição** (`ProdutoCampo` — o que a
 * empresa resolveu guardar) e o **valor** por produto. A definição é um
 * cadastro de verdade, e é ela que permite validar o que se digita e montar a
 * tela sozinha.
 */

export const produtoCampoTipoSchema = z.enum([
  "texto",
  "texto_longo",
  "numero",
  "booleano",
  "data",
  "lista",
]);
export type ProdutoCampoTipo = z.infer<typeof produtoCampoTipoSchema>;

export const PRODUTO_CAMPO_TIPO_LABEL: Record<ProdutoCampoTipo, string> = {
  texto: "Texto",
  texto_longo: "Texto longo",
  numero: "Número",
  booleano: "Sim/Não",
  data: "Data",
  lista: "Lista de opções",
};

/**
 * `peso-bruto`, `diluicao`, `tensao-v`. Minúsculas, dígitos e hífen.
 *
 * É por esta chave que a IA e as integrações referenciam o campo, então ela
 * precisa ser estável: renomear o rótulo não pode quebrar quem já lê. Por isso
 * a chave não é editável depois de criada (ver `produtoCampoUpdateSchema`).
 */
export const produtoCampoChaveSchema = z
  .string()
  .trim()
  .min(2, "A chave precisa de ao menos 2 caracteres")
  .max(40)
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Use minúsculas, números e hífen — por exemplo, peso-bruto",
  );

export const produtoCampoSchema = z.object({
  id: z.string().uuid(),
  chave: z.string(),
  nome: z.string(),
  tipo: produtoCampoTipoSchema,
  unidade: z.string().nullable(),
  opcoes: z.array(z.string()),
  grupo: z.string().nullable(),
  ajuda: z.string().nullable(),
  ordem: z.number().int(),
  obrigatorio: z.boolean(),
  visivelAgente: z.boolean(),
  ativo: z.boolean(),
});
export type ProdutoCampo = z.infer<typeof produtoCampoSchema>;

export const produtoCampoCreateSchema = z
  .object({
    chave: produtoCampoChaveSchema,
    nome: z.string().trim().min(1, "Informe o nome").max(60),
    tipo: produtoCampoTipoSchema.default("texto"),
    unidade: z.string().trim().max(12).nullable().optional(),
    opcoes: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
    grupo: z.string().trim().max(40).nullable().optional(),
    ajuda: z.string().trim().max(200).nullable().optional(),
    ordem: z.coerce.number().int().min(0).max(999).default(0),
    obrigatorio: z.boolean().default(false),
    visivelAgente: z.boolean().default(true),
    ativo: z.boolean().default(true),
  })
  // Campo de lista sem opções não tem como ser preenchido: a tela mostraria um
  // select vazio e o valor nunca passaria na validação.
  .refine((v) => v.tipo !== "lista" || v.opcoes.length > 0, {
    message: "Campo de lista precisa de ao menos uma opção",
    path: ["opcoes"],
  });
export type ProdutoCampoCreate = z.infer<typeof produtoCampoCreateSchema>;

/** A chave fica de fora: mudá-la quebraria quem já referencia o campo. */
export const produtoCampoUpdateSchema = z
  .object({
    nome: z.string().trim().min(1).max(60).optional(),
    tipo: produtoCampoTipoSchema.optional(),
    unidade: z.string().trim().max(12).nullable().optional(),
    opcoes: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
    grupo: z.string().trim().max(40).nullable().optional(),
    ajuda: z.string().trim().max(200).nullable().optional(),
    ordem: z.coerce.number().int().min(0).max(999).optional(),
    obrigatorio: z.boolean().optional(),
    visivelAgente: z.boolean().optional(),
    ativo: z.boolean().optional(),
  })
  .refine(
    (v) => v.tipo !== "lista" || v.opcoes === undefined || v.opcoes.length > 0,
    {
      message: "Campo de lista precisa de ao menos uma opção",
      path: ["opcoes"],
    },
  );
export type ProdutoCampoUpdate = z.infer<typeof produtoCampoUpdateSchema>;

/**
 * O valor de um campo em um produto.
 *
 * `valor` trafega como texto no formato canônico do tipo — número com ponto
 * decimal, booleano `true`/`false`, data `AAAA-MM-DD`. Quem exibe converte a
 * partir do `tipo` da definição.
 */
export const produtoCampoValorSchema = z.object({
  campoId: z.string().uuid(),
  chave: z.string(),
  nome: z.string(),
  tipo: produtoCampoTipoSchema,
  unidade: z.string().nullable(),
  opcoes: z.array(z.string()),
  grupo: z.string().nullable(),
  ajuda: z.string().nullable(),
  obrigatorio: z.boolean(),
  /** Nulo = campo definido e ainda não preenchido neste produto. */
  valor: z.string().nullable(),
});
export type ProdutoCampoValor = z.infer<typeof produtoCampoValorSchema>;

/**
 * Gravação em lote: a tela manda o formulário inteiro.
 *
 * `valor: null` (ou string vazia) apaga o preenchimento — é como se limpa um
 * campo sem precisar de uma rota de exclusão só para isso.
 */
export const produtoCamposGravarSchema = z.object({
  valores: z
    .array(
      z.object({
        campoId: z.string().uuid(),
        valor: z.string().max(2000).nullable(),
      }),
    )
    .max(200),
});
export type ProdutoCamposGravar = z.infer<typeof produtoCamposGravarSchema>;

export const PRODUTO_CAMPO_EXAMPLE: ProdutoCampo = {
  id: "b7e1c3d4-5a6f-4b28-9c01-2d3e4f5a6b7c",
  chave: "diluicao",
  nome: "Diluição",
  tipo: "texto",
  unidade: null,
  opcoes: [],
  grupo: "Uso e diluição",
  ajuda: "Proporção recomendada pelo fabricante, por exemplo 1:100.",
  ordem: 1,
  obrigatorio: false,
  visivelAgente: true,
  ativo: true,
};
