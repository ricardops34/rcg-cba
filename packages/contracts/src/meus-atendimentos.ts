import { z } from "zod";

/**
 * Linha do tempo do que o vendedor fez — o histórico de atendimento do
 * cliente, visto pelo outro lado.
 *
 * A fonte é a **rotina de Atividades**, e não uma tabela nova: cada passo do
 * atendimento (conversa de WhatsApp, 2ª via de boleto ou DANFE, envio de
 * títulos, orçamento, agendamento) já entra lá como atividade concluída, pelos
 * mesmos helpers que a tela do cliente usa. Um segundo lugar para guardar
 * "o que aconteceu" divergiria do primeiro na primeira semana.
 */

/**
 * De onde veio cada linha da timeline.
 *
 * Inferida do título da atividade, que é escrito por um punhado de helpers no
 * servidor (`registrarAtendimentoWhatsapp`, `registrarAtividadeDocumento`,
 * `registrarAtividadeOrcamento`) — o texto é padronizado, não digitado. O que
 * um usuário escreveu à mão cai em `agenda`, que é onde ele mesmo o colocou.
 */
export const categoriaAtendimentoSchema = z.enum([
  "whatsapp",
  "documento",
  "orcamento",
  "agenda",
]);
export type CategoriaAtendimento = z.infer<typeof categoriaAtendimentoSchema>;

export const CATEGORIA_ATENDIMENTO_ROTULO: Record<CategoriaAtendimento, string> =
  {
    whatsapp: "Atendimento",
    documento: "Documentos",
    orcamento: "Orçamentos",
    agenda: "Agenda",
  };

/** Quantos dias o resumo alcança — mínimo e máximo aceitos pela rota. */
export const DIAS_MIN_ATENDIMENTOS = 1;
/**
 * Teto do **resumo** (o que o agente pede e cabe numa resposta de chat).
 * A tela não usa: lá o feed rola sem recorte de período.
 */
export const DIAS_MAX_ATENDIMENTOS = 7;
/** Teto do filtro de período da tela — acima disso, a pergunta é relatório. */
export const DIAS_MAX_HISTORICO = 365;

/**
 * De quem é o atendimento que a tela mostra.
 *
 * `proprio` é o que o usuário logado fez — a carteira dele **mais** o que ele
 * executou na carteira de outro, que é o dia a dia de supervisor e gerente:
 * eles atendem, orçam e cobram pelos subordinados, e o registro fica na
 * carteira do subordinado (é lá que o histórico do cliente é consultado).
 * Sem isso, quem mais atende via a tela vazia.
 *
 * `equipe` é a linha do tempo dos subordinados, para supervisor e gerente
 * acompanharem. Quem não tem equipe recebe o mesmo que `proprio` — a resposta
 * traz `podeVerEquipe` para a tela saber se oferece a opção.
 */
export const escopoAtendimentoSchema = z.enum(["proprio", "equipe"]);
export type EscopoAtendimento = z.infer<typeof escopoAtendimentoSchema>;

/** Quantos registros por página do feed. */
export const PAGINA_ATENDIMENTOS = 25;
/** Teto do que a tela deixa pedir de uma vez. */
export const PAGINA_MAX_ATENDIMENTOS = 50;

export const meusAtendimentosQuerySchema = z.object({
  /**
   * Janela em dias, contando hoje. **Ausente = sem recorte**: a tela é um
   * feed, e quem rola continua no mês passado sem precisar escolher período.
   * O filtro fica como atalho ("hoje", "7 dias") para quem quer só o recente.
   *
   * O agente usa o mesmo endpoint com 1 a 7 dias — lá o resultado vira texto
   * numa resposta de chat, e um período aberto não caberia.
   */
  dias: z.coerce
    .number()
    .int()
    .min(DIAS_MIN_ATENDIMENTOS)
    .max(DIAS_MAX_HISTORICO)
    .optional(),
  /** Só o que foi feito para este cliente. Ausente = a carteira toda. */
  clienteId: z.string().uuid().optional(),
  escopo: escopoAtendimentoSchema.default("proprio"),
  /**
   * Onde a página anterior parou (`proximoCursor` da resposta). É o instante
   * do último item mais o id dele — data sozinha repetiria ou pularia registro
   * quando dois acontecem no mesmo segundo, que é o normal aqui: uma conversa
   * e o boleto que saiu dela caem no mesmo minuto.
   */
  cursor: z.string().optional(),
  limite: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINA_MAX_ATENDIMENTOS)
    .default(PAGINA_ATENDIMENTOS),
});
export type MeusAtendimentosQuery = z.infer<typeof meusAtendimentosQuerySchema>;

export const atendimentoItemSchema = z.object({
  id: z.string().uuid(),
  /** Quando aconteceu: a conclusão, ou a criação do que ainda está pendente. */
  quando: z.string().datetime(),
  titulo: z.string(),
  descricao: z.string().nullable(),
  categoria: categoriaAtendimentoSchema,
  clienteId: z.string().uuid().nullable(),
  clienteNome: z.string().nullable(),
  /**
   * De quem é a carteira onde o registro ficou. Só interessa quando a tela
   * mostra a equipe — na própria linha do tempo seria a mesma resposta em
   * todas as linhas.
   */
  vendedorNome: z.string().nullable(),
  /** Pendente aparece na timeline como o que ficou marcado, não como feito. */
  concluida: z.boolean(),
});
export type AtendimentoItem = z.infer<typeof atendimentoItemSchema>;

export const meusAtendimentosSchema = z.object({
  dias: z.number().int().nullable().describe("Nulo = feed sem recorte"),
  de: z.string().datetime().nullable(),
  ate: z.string().datetime(),
  /**
   * Cursor da próxima página, ou nulo quando o feed acabou. É o que o scroll
   * infinito devolve ao servidor para continuar de onde parou.
   */
  proximoCursor: z.string().nullable(),
  escopo: escopoAtendimentoSchema,
  /**
   * Se este usuário tem equipe — é o que decide se a tela oferece o seletor
   * "minha carteira / minha equipe". Vem do servidor porque quem sabe da
   * hierarquia é ele, não o navegador.
   */
  podeVerEquipe: z.boolean(),
  totais: z.object({
    registros: z.number().int(),
    clientes: z.number().int().describe("Clientes distintos atendidos"),
    whatsapp: z.number().int(),
    documento: z.number().int(),
    orcamento: z.number().int(),
    agenda: z.number().int(),
  }),
  itens: z.array(atendimentoItemSchema),
});
export type MeusAtendimentos = z.infer<typeof meusAtendimentosSchema>;
