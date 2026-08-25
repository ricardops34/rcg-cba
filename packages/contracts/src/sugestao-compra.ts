import { z } from "zod";

/**
 * Sugestão de compra: produtos que clientes semelhantes compram e o alvo não.
 *
 * A semelhança tem dois eixos somados, com pesos configuráveis por parâmetro:
 *
 * - **cesta** — Jaccard entre os conjuntos de produtos comprados. Funciona desde
 *   o dia 1, sobre o histórico de notas que já existe.
 * - **CNAE** — ramo de atividade compartilhado (`cliente_cnaes`, carregado da
 *   Receita). Vale zero para cliente sem CNAE, e aí o peso recai na cesta.
 *
 * A evidência volta junto de propósito: sem saber *quais* clientes semelhantes
 * compram o produto e quanto, a lista é indistinguível de palpite, e o vendedor
 * não usa.
 */

export const baseSemelhancaSchema = z.enum(["ambos", "cesta", "cnae"]);
export type BaseSemelhanca = z.infer<typeof baseSemelhancaSchema>;

/**
 * Como comparar o CNAE de dois clientes.
 *
 * - **exata** — só conta quando a subclasse é idêntica. Era a regra única até
 *   2026-08-25, e continua disponível para comparar resultados.
 * - **hierarquica** — usa os níveis do código (classe, grupo, divisão), que já
 *   estão decompostos na tabela `cnaes`.
 *
 * A diferença não é acadêmica. `5611201` (restaurantes) e `5611203`
 * (lanchonetes) são o mesmo comprador e, na regra exata, contavam como zero
 * afinidade. Medido na base da RCG: 68.876 pares de clientes compartilham
 * subclasse, mas 159.357 compartilham classe — 90 mil pares de mesmo ramo que
 * o motor simplesmente não enxergava.
 */
export const afinidadeCnaeSchema = z.enum(["hierarquica", "exata"]);
export type AfinidadeCnae = z.infer<typeof afinidadeCnaeSchema>;

/**
 * Peso de cada nível de parentesco entre CNAEs, do mais próximo ao mais
 * distante. Subclasse igual continua valendo 1, então a regra hierárquica
 * **não rebaixa** nenhum par que a regra exata já reconhecia: ela só acrescenta
 * sinal onde antes havia zero.
 *
 * A divisão para em 0,2 de propósito — dois clientes na mesma divisão
 * ("alimentação") podem ser um restaurante e uma fábrica de sorvete, que não
 * compram a mesma coisa. Abaixo disso (seção) não entra: seria quase todo mundo.
 */
export const PESO_NIVEL_CNAE = {
  subclasse: 1,
  classe: 0.7,
  grupo: 0.4,
  divisao: 0.2,
} as const;

export const sugestaoCompraQuerySchema = z.object({
  meses: z.coerce
    .number()
    .int()
    .min(1)
    .max(60)
    .default(12)
    .describe("Janela de histórico considerada, em meses"),
  limite: z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Quantos produtos sugerir"),
  semelhantes: z.coerce
    .number()
    .int()
    .min(3)
    .max(100)
    .default(30)
    .describe("Quantos clientes semelhantes considerar (top-K)"),
  baseSemelhanca: baseSemelhancaSchema
    .default("ambos")
    .describe("Eixo da semelhança: cesta de compras, CNAE ou os dois"),
  afinidadeCnae: afinidadeCnaeSchema
    .default("hierarquica")
    .describe(
      "Como comparar CNAE: só o código idêntico, ou também ramos vizinhos",
    ),
});
export type SugestaoCompraQuery = z.infer<typeof sugestaoCompraQuerySchema>;

export const clienteSemelhanteSchema = z.object({
  // Vazio quando o comparável está fora da carteira: ele entrou no cálculo,
  // mas não pode ser identificado nem aberto. Por isso não é uuid().
  clienteId: z.string(),
  razaoSocial: z.string(),
  codigoErp: z.string().nullable(),
  municipio: z.string().nullable(),
  uf: z.string().nullable(),
  score: z.number().describe("Semelhança combinada, 0 a 1"),
  indiceCesta: z.number().describe("Jaccard entre as cestas de produtos"),
  cnaesEmComum: z.number().int().describe("CNAEs com subclasse idêntica"),
  /**
   * Parentesco mais próximo encontrado entre os CNAEs dos dois clientes. Vai
   * junto na evidência porque "mesmo ramo" e "ramo vizinho" mudam o quanto o
   * vendedor confia na sugestão.
   */
  nivelCnae: z
    .enum(["subclasse", "classe", "grupo", "divisao"])
    .nullable()
    .default(null),
  /**
   * O comparável está na carteira que este usuário alcança?
   *
   * A comparação roda sobre a **base inteira** — o ramo diz muito mais com 800
   * clientes do que com os 60 de uma carteira, e o que se entrega são produtos,
   * não clientes. Quem está fora volta sem identificação: contribuiu para o
   * padrão, mas não pode ser nomeado.
   */
  naCarteira: z.boolean().default(true),
  mesmoCnaePrincipal: z.boolean(),
  mesmaRegiao: z.boolean(),
  produtosEmComum: z.number().int(),
});
export type ClienteSemelhante = z.infer<typeof clienteSemelhanteSchema>;

export const produtoSugeridoSchema = z.object({
  produtoId: z.string().uuid(),
  codigoErp: z.string(),
  descricao: z.string(),
  score: z.number(),
  semelhantesQueCompram: z.number().int(),
  totalSemelhantes: z.number().int(),
  cobertura: z.number().describe("semelhantesQueCompram / totalSemelhantes"),
  valorMedio: z.number().describe("Ticket médio do produto entre os semelhantes"),
  ultimaCompraNoGrupo: z.string().datetime().nullable(),
  precoTabelaCliente: z
    .number()
    .nullable()
    .describe("Preço vigente na tabela do cliente-alvo, quando resolvível"),
  // Nomes dos semelhantes que compram — é o que o vendedor usa como argumento.
  evidencia: z.array(z.string()),
});
export type ProdutoSugerido = z.infer<typeof produtoSugeridoSchema>;

export const sugestaoCompraResultadoSchema = z.object({
  clienteId: z.string().uuid(),
  razaoSocial: z.string(),
  produtosNaCesta: z.number().int().describe("Tamanho da cesta do cliente-alvo"),
  cnaes: z.array(z.string()).describe("CNAEs do alvo (código — descrição)"),
  clientesSemelhantes: z.array(clienteSemelhanteSchema),
  sugestoes: z.array(produtoSugeridoSchema),
  // Diagnóstico honesto quando não dá para sugerir, em vez de lista vazia sem
  // explicação: cliente sem compras, sem semelhantes, ou já compra tudo.
  aviso: z.string().nullable(),
});
export type SugestaoCompraResultado = z.infer<typeof sugestaoCompraResultadoSchema>;

export const SUGESTAO_COMPRA_EXAMPLE: SugestaoCompraResultado = {
  clienteId: "9c8d7e6f-5a4b-4c3d-2e1f-0a9b8c7d6e5f",
  razaoSocial: "RESTAURANTE DO CENTRO LTDA",
  produtosNaCesta: 42,
  cnaes: ["5611201 — RESTAURANTES E SIMILARES"],
  clientesSemelhantes: [
    {
      clienteId: "1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9",
      razaoSocial: "CANTINA DA PRACA LTDA",
      codigoErp: "004417",
      municipio: "Campo Grande",
      uf: "MS",
      score: 0.62,
      indiceCesta: 0.48,
      cnaesEmComum: 1,
      nivelCnae: "subclasse",
      naCarteira: true,
      mesmoCnaePrincipal: true,
      mesmaRegiao: true,
      produtosEmComum: 27,
    },
  ],
  sugestoes: [
    {
      produtoId: "5f6a7b8c-9d0e-4f12-8a3b-4c5d6e7f8091",
      codigoErp: "PROD-118",
      descricao: "OLEO DE SOJA 900ML CX/20",
      score: 0.81,
      semelhantesQueCompram: 24,
      totalSemelhantes: 30,
      cobertura: 0.8,
      valorMedio: 3420.5,
      ultimaCompraNoGrupo: "2026-08-02T00:00:00.000Z",
      precoTabelaCliente: 168.9,
      evidencia: ["CANTINA DA PRACA LTDA", "RESTAURANTE SABOR CASEIRO"],
    },
  ],
  aviso: null,
};
