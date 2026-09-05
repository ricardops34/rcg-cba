import { z } from "zod";

/**
 * WhatsApp do vendedor — Fatia 1 (conectar e conversar).
 * Ver `docs/planos/whatsapp-vendedor.md`.
 *
 * Duas regras deste módulo estão codificadas aqui e não devem ser afrouxadas
 * sem decisão explícita:
 *
 * 1. **A credencial de sessão nunca sai da API.** Nenhum schema de leitura
 *    expõe `credencialCifrada` — o mesmo tratamento da chave do agente de IA.
 * 2. **Só se persiste conversa de contato ligado a cliente.** O schema de
 *    conversa carrega `clienteId` nulo apenas para o caso "existe uma conversa
 *    não vinculada"; mensagem sem vínculo não é gravada.
 */

export const WHATSAPP_TRANSPORTES = [
  "zapo",
  "evolution_go",
  "cloud_api",
] as const;
export const whatsappTransporteSchema = z.enum(WHATSAPP_TRANSPORTES);
export type WhatsappTransporte = z.infer<typeof whatsappTransporteSchema>;

/**
 * Transportes que a plataforma sabe de fato operar.
 *
 * `cloud_api` continua no enum porque as linhas já gravadas o aceitam, mas não
 * existe adaptador: selecioná-lo é recusado na configuração, em vez de deixar
 * o vendedor descobrir na tela de pareamento que nada acontece.
 */
export const WHATSAPP_TRANSPORTES_IMPLEMENTADOS = [
  "zapo",
  "evolution_go",
] as const;
export type WhatsappTransporteImplementado =
  (typeof WHATSAPP_TRANSPORTES_IMPLEMENTADOS)[number];

export function whatsappTransporteImplementado(
  transporte: string,
): transporte is WhatsappTransporteImplementado {
  return (WHATSAPP_TRANSPORTES_IMPLEMENTADOS as readonly string[]).includes(
    transporte,
  );
}

/** Rótulo do provedor para telas e mensagens de erro. */
export const WHATSAPP_TRANSPORTE_ROTULO: Record<WhatsappTransporte, string> = {
  zapo: "zapo-js",
  evolution_go: "Evolution GO",
  cloud_api: "API Oficial da Meta",
};

export const WHATSAPP_SESSAO_STATUS = [
  "desconectada",
  "pareando",
  "conectada",
  "banida",
] as const;
export const whatsappSessaoStatusSchema = z.enum(WHATSAPP_SESSAO_STATUS);
export type WhatsappSessaoStatus = z.infer<typeof whatsappSessaoStatusSchema>;

export const whatsappDirecaoSchema = z.enum(["entrada", "saida"]);
export type WhatsappDirecao = z.infer<typeof whatsappDirecaoSchema>;

export const whatsappTipoMensagemSchema = z.enum([
  "texto",
  "imagem",
  "documento",
  "audio",
  "video",
  "localizacao",
  "contato",
  "outro",
]);
export type WhatsappTipoMensagem = z.infer<typeof whatsappTipoMensagemSchema>;

export const whatsappStatusEntregaSchema = z.enum([
  "pendente",
  "enviada",
  "entregue",
  "lida",
  "erro",
]);
export type WhatsappStatusEntrega = z.infer<typeof whatsappStatusEntregaSchema>;

/**
 * Texto do aceite que o vendedor confirma ao conectar. A versão fica gravada
 * na sessão: mudou o texto, o aceite antigo não vale mais para o novo teor.
 */
export const WHATSAPP_ACEITE_VERSAO = "2026-08-14";
/**
 * O que o transporte `zapo` é de fato — e por que isso importa para quem
 * conecta o próprio número.
 *
 * Não é a API oficial da Meta: é o WhatsApp Web pareado ao aparelho do
 * vendedor. Funciona, e é o que permite usar o número que o cliente já conhece
 * sem custo por conversa — mas o WhatsApp pode bloquear o número, e quem perde
 * o número é o vendedor, não a plataforma. O aviso fica na tela de conexão
 * porque é ali que a pessoa decide, e não escondido num manual.
 *
 * Texto único, usado na conexão do vendedor e na central de instâncias.
 */
export const WHATSAPP_AVISO_NAO_OFICIAL =
  "Esta é uma conexão NÃO OFICIAL: a plataforma pareia o WhatsApp Web ao seu " +
  "aparelho, como um computador conectado, e não usa a API oficial da Meta. " +
  "O WhatsApp pode bloquear números que considere abusivos — evite disparo em " +
  "massa, mensagem não solicitada e lista de transmissão. Use como você usaria " +
  "o aplicativo: uma conversa de cada vez, com quem espera seu contato.";

export const WHATSAPP_ACEITE_TEXTO =
  "Ao conectar, as conversas com contatos vinculados a clientes serão gravadas " +
  "na plataforma e poderão ser consultadas pelo seu supervisor e pelo gerente. " +
  "Conversas com contatos não vinculados a clientes não são gravadas.";

// --------------------------------------------------------------------------
// Configuração da empresa (Configurações > WhatsApp)
// --------------------------------------------------------------------------

export const whatsappConfigSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  ativo: z.boolean(),
  transporte: whatsappTransporteSchema,
  workerUrl: z.string().nullable(),
  /** Endereço interno da Evolution GO. Usado só quando o transporte é dela. */
  evolutionUrl: z.string().nullable(),
  /**
   * A chave administrativa **nunca** é devolvida: só o rastro de que existe.
   * Mesmo tratamento da chave do agente de IA — quem tem a `GLOBAL_API_KEY`
   * cria e apaga instância de qualquer vendedor.
   */
  evolutionApiKeyDefinida: z.boolean(),
  evolutionApiKeyUltimos4: z.string().nullable(),
  /**
   * Versão da imagem homologada, registrada por quem implantou. Serve para o
   * diagnóstico: divergência de payload entre versões é a causa mais provável
   * de um evento que parou de chegar.
   */
  evolutionVersao: z.string().nullable(),
  retencaoDias: z.number().int(),
  historicoDias: z
    .number()
    .int()
    .describe(
      "Dias de histórico do celular importados quando a instância conecta. 0 = nenhum",
    ),
  dddPadrao: z
    .string()
    .nullable()
    .describe(
      "DDD usado quando o telefone do cadastro vem sem ele. Nulo = não completar",
    ),

  // ---------------------------------------------------------------
  // Atendimento pela IA no número institucional
  // ---------------------------------------------------------------
  // Estes quatro existiam só no banco: a migration os criou, a triagem lia dois
  // deles, e não havia caminho de escrita nenhum — nem contrato, nem rota, nem
  // tela. Com `atendimentoIaAtivo` nascendo `false` e ninguém podendo ligá-lo,
  // a triagem inteira era inalcançável — ver
  // docs/planos/whatsapp-institucional-funcionarios.md, "Fatia 0".

  atendimentoIaAtivo: z
    .boolean()
    .describe(
      "Liga a triagem por IA no número da empresa. Desligada, o institucional se comporta como qualquer outro número: a mensagem entra e fica aguardando alguém",
    ),
  atendimentoSaudacao: z
    .string()
    .nullable()
    .describe(
      "Primeira fala do atendimento, escrita pela empresa. Não vai ao modelo — é texto literal",
    ),
  atendimentoInformacoes: z
    .string()
    .nullable()
    .describe(
      "O que a IA pode responder sobre a empresa (horário, endereço, pagamento, prazos). Vai no prompt como contexto",
    ),
  atendimentoInatividadeMin: z
    .number()
    .int()
    .describe(
      "Minutos de silêncio do cliente antes de a conversa em triagem ser encerrada. 0 desliga",
    ),

  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WhatsappConfig = z.infer<typeof whatsappConfigSchema>;

export const whatsappConfigUpdateSchema = z.object({
  ativo: z.boolean().optional(),
  transporte: whatsappTransporteSchema.optional(),
  workerUrl: z
    .string()
    .trim()
    .url("Informe uma URL válida (ex.: http://whatsapp-worker:3100)")
    .nullable()
    .optional(),
  evolutionUrl: z
    .string()
    .trim()
    .url("Informe uma URL válida (ex.: http://rcgcba-evolution-go:8080)")
    .nullable()
    .optional(),
  /**
   * Chave administrativa da Evolution GO. Só de escrita: a API cifra antes de
   * gravar e nunca devolve o valor. String vazia apaga a chave gravada —
   * é como a tela "limpa" o campo sem precisar de uma rota só para isso.
   */
  evolutionApiKey: z.string().trim().max(500).nullable().optional(),
  evolutionVersao: z.string().trim().max(40).nullable().optional(),
  retencaoDias: z
    .number()
    .int()
    .min(0)
    .max(3650)
    .optional()
    .describe("0 = guardar indefinidamente"),
  // O teto de 365 dias não é técnico: acima disso a importação deixa de ser
  // "trazer o atendimento recente" e vira arquivo morto de conversa pessoal no
  // servidor da empresa.
  historicoDias: z
    .number()
    .int()
    .min(0)
    .max(365)
    .optional()
    .describe("0 = não importar histórico; só o que chegar ao vivo"),
  dddPadrao: z
    .string()
    .trim()
    .regex(/^\d{2}$/, "O DDD tem dois dígitos (ex.: 67)")
    .nullable()
    .optional(),

  atendimentoIaAtivo: z.boolean().optional(),
  /**
   * Texto literal, não prompt: é o que a empresa quer que o cliente leia. Vazio
   * vira nulo (a tela limpa o campo apagando o conteúdo), e sem saudação a IA
   * simplesmente começa respondendo.
   */
  atendimentoSaudacao: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v)),
  /**
   * Vai ao modelo como contexto da empresa. O teto é generoso porque aqui cabe
   * horário, endereço, formas de pagamento e prazos — mas não é ilimitado: o
   * texto entra em **toda** conversa, e prompt grande custa em cada mensagem.
   */
  atendimentoInformacoes: z
    .string()
    .trim()
    .max(4000)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v)),
  atendimentoInatividadeMin: z
    .number()
    .int()
    .min(0)
    .max(1440)
    .optional()
    .describe("0 = não encerrar por silêncio"),
});
export type WhatsappConfigUpdate = z.infer<typeof whatsappConfigUpdateSchema>;

/**
 * Se o WhatsApp está ligado para a empresa ativa — o mesmo `ativo` da
 * configuração, exposto sem a configuração inteira.
 *
 * Existe porque quem precisa da resposta é o vendedor (o menu e o atalho de
 * Atendimento só aparecem com a integração no ar), e ele não tem — nem deve
 * ter — `whatsapp-config.visualizar` para ler `GET /whatsapp/config`.
 */
export const whatsappIntegracaoSchema = z.object({
  ativo: z.boolean(),
});
export type WhatsappIntegracao = z.infer<typeof whatsappIntegracaoSchema>;

// --------------------------------------------------------------------------
// Sessão
// --------------------------------------------------------------------------

export const whatsappSessaoSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  /** Nulo na sessão institucional: ela não pertence a vendedor nenhum. */
  vendedorId: z.string().uuid().nullable(),
  vendedorNome: z.string().describe("Desnormalizado para a tela da equipe; 'Empresa' na institucional"),
  numero: z.string().nullable().describe("Número conectado, quando pareado"),
  status: whatsappSessaoStatusSchema,
  transporte: whatsappTransporteSchema,
  ultimaConexao: z.string().datetime().nullable(),
  ultimoErro: z.string().nullable(),
  aceiteEm: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WhatsappSessao = z.infer<typeof whatsappSessaoSchema>;

/** Início do pareamento. O aceite é obrigatório — sem ele não há sessão. */
export const whatsappConectarSchema = z.object({
  aceite: z
    .literal(true)
    .describe("Confirmação de que o vendedor leu WHATSAPP_ACEITE_TEXTO"),
  aceiteVersao: z.string().default(WHATSAPP_ACEITE_VERSAO),
});
export type WhatsappConectar = z.infer<typeof whatsappConectarSchema>;

/**
 * Estado do pareamento, consultado pela tela enquanto o QR não é lido.
 *
 * O QR expira em segundos e é renovado pelo provedor; a tela repinta a cada
 * atualização em vez de manter o primeiro código na tela.
 */
export const whatsappPareamentoSchema = z.object({
  status: whatsappSessaoStatusSchema,
  qr: z.string().nullable().describe("Conteúdo do QR a renderizar; null quando não há"),
  numero: z.string().nullable(),
  erro: z.string().nullable(),
});
export type WhatsappPareamento = z.infer<typeof whatsappPareamentoSchema>;

// --------------------------------------------------------------------------
// Contato e conversa
// --------------------------------------------------------------------------

export const whatsappContatoSchema = z.object({
  id: z.string().uuid(),
  jid: z.string(),
  nomeExibicao: z.string().nullable(),
  telefoneNormalizado: z.string().nullable(),
  tipo: z.enum(["geral", "financeiro", "compras", "contabilidade_fiscal", "outros"]),
  email: z.string().nullable(),
  fotoUrl: z.string().nullable(),
  clienteId: z.string().uuid().nullable(),
  clienteRazaoSocial: z.string().nullable(),
  clienteCodigoErp: z.string().nullable(),
  clienteTelefones: z.array(z.string()).default([]),
  ignorado: z.boolean(),
});
export type WhatsappContato = z.infer<typeof whatsappContatoSchema>;

/**
 * Situação da cobrança do cliente, resumida no pior caso em aberto — é o que
 * cabe num ícone: o título mais crítico é o que muda a conversa.
 *
 * `vencendo` é o que vence nos próximos 7 dias, a janela em que ainda dá para
 * lembrar o cliente antes de virar cobrança.
 */
export const whatsappSituacaoTitulosSchema = z.enum([
  "vencido",
  "vencendo",
  "em_dia",
]);
export type WhatsappSituacaoTitulos = z.infer<
  typeof whatsappSituacaoTitulosSchema
>;

export const whatsappConversaSchema = z.object({
  id: z.string().uuid(),
  empresaId: z.string().uuid(),
  sessaoId: z.string().uuid(),
  contato: whatsappContatoSchema,
  clienteId: z.string().uuid().nullable(),
  ultimaMensagemEm: z.string().datetime().nullable(),
  ultimaMensagemPrevia: z
    .string()
    .nullable()
    .describe("Primeiros caracteres da última mensagem, para a lista"),
  naoLidas: z.number().int(),
  arquivada: z.boolean(),
  /**
   * De quem é a conversa — e, como cada vendedor tem uma conexão só
   * (`@@unique(empresaId, vendedorId)` em `whatsapp_sessoes`), também **por
   * qual número** ela entrou.
   *
   * Importa quando o supervisor lista as da equipe: a lista junta atendimentos
   * de conexões diferentes, e sem isso não dá para saber por qual número o
   * cliente falou — nem, ao responder, de qual número a resposta vai sair.
   */
  vendedorId: z.string().uuid(),
  vendedorNome: z.string(),
  sessaoNumero: z
    .string()
    .nullable()
    .describe("Número da conexão que recebeu a conversa. Null enquanto não pareou"),
  /**
   * Sinais do cliente para a lista de conversas — o que o vendedor precisa
   * saber **antes** de abrir o atendimento. Nulos quando o contato não tem
   * cliente vinculado ou quando falta a permissão da rotina dona do dado.
   */
  diasSemComprar: z
    .number()
    .int()
    .nullable()
    .describe("Dias desde a última nota (positivação). Null = nunca comprou"),
  situacaoTitulos: whatsappSituacaoTitulosSchema.nullable(),
  proximoRetornoEm: z.string().datetime().nullable(),
  orcamentoAguardandoAprovacao: z.boolean(),
  /**
   * Outros vendedores que também têm conversa aberta com este mesmo contato.
   *
   * O número do cliente não é exclusivo de um atendimento: dois vendedores
   * podem estar falando com a mesma pessoa sem saber. Aqui vai só o nome, para
   * a tela sinalizar e o vendedor poder conferir antes de prometer algo.
   */
  outrosAtendentes: z.array(z.string()).default([]),
});
export type WhatsappConversa = z.infer<typeof whatsappConversaSchema>;

export const whatsappEventoAtendimentoSchema = z.object({
  id: z.string().uuid(),
  acao: z.string(),
  orcamentoId: z.string().uuid().nullable(),
  atividadeId: z.string().uuid().nullable(),
  tituloReceberId: z.string().uuid().nullable(),
  detalhe: z.record(z.string(), z.unknown()).nullable(),
  executadaPorNome: z.string().nullable(),
  criadaEm: z.string().datetime(),
});
export type WhatsappEventoAtendimento = z.infer<
  typeof whatsappEventoAtendimentoSchema
>;

export const whatsappConversaQuerySchema = z.object({
  busca: z.string().trim().optional(),
  arquivadas: z.coerce.boolean().default(false),
  semVinculo: z
    .coerce
    .boolean()
    .default(false)
    .describe("Só as conversas de contato ainda não ligado a cliente"),
  // Presente só para supervisor/gerente; vendedor sempre vê a própria carteira.
  vendedorId: z.string().uuid().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  tamanho: z.coerce.number().int().min(1).max(100).default(30),
});
export type WhatsappConversaQuery = z.infer<typeof whatsappConversaQuerySchema>;

// --------------------------------------------------------------------------
// Agenda do aparelho
// --------------------------------------------------------------------------

/**
 * Contato como o **celular** do vendedor o conhece.
 *
 * Nada disto é gravado na plataforma: a lista é lida do aparelho e cruzada com
 * o cadastro na hora. O que entra no banco é só o que o vendedor vincular —
 * copiar a agenda pessoal dele para dentro do sistema seria o oposto do que a
 * regra de privacidade do módulo decidiu.
 */
export const whatsappContatoAgendaSchema = z.object({
  jid: z.string(),
  nome: z.string().nullable(),
  telefone: z.string().nullable().describe("Só dígitos"),
  naoLidas: z.number().int().default(0),
  /** Vínculo já existente na plataforma. */
  clienteId: z.string().uuid().nullable(),
  clienteRazaoSocial: z.string().nullable(),
  clienteCodigoErp: z.string().nullable(),
  ignorado: z.boolean(),
  /** Conversa já aberta por aqui, quando houver. */
  conversaId: z.string().uuid().nullable(),
  /**
   * Cliente que o telefone sugere, quando aponta para **um** só. Sugestão,
   * não vínculo: quem confirma é o vendedor.
   */
  sugestaoClienteId: z.string().uuid().nullable(),
  sugestaoClienteNome: z.string().nullable(),
});
export type WhatsappContatoAgenda = z.infer<typeof whatsappContatoAgendaSchema>;

/**
 * Início de conversa a partir da carteira ou da agenda.
 *
 * Um dos três identificadores basta: `clienteId` (pega o telefone do
 * cadastro), `jid` (contato da agenda) ou `telefone` digitado.
 */
export const whatsappIniciarConversaSchema = z
  .object({
    clienteId: z.string().uuid().optional(),
    jid: z.string().optional(),
    telefone: z.string().trim().optional(),
    nome: z.string().trim().optional(),
  })
  .refine((v) => v.clienteId || v.jid || v.telefone, {
    message: "Informe o cliente, o contato da agenda ou o número",
  });
export type WhatsappIniciarConversa = z.infer<
  typeof whatsappIniciarConversaSchema
>;

/** Vínculo manual do contato a um cliente — é o que autoriza a gravação. */
export const whatsappVincularSchema = z.object({
  clienteId: z.string().uuid().nullable().describe("null desfaz o vínculo"),
  tipo: z
    .enum(["geral", "financeiro", "compras", "contabilidade_fiscal", "outros"])
    .default("geral"),
  nome: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  ignorar: z
    .boolean()
    .default(false)
    .describe("Marca como não-cliente para a tela parar de perguntar"),
});
export type WhatsappVincular = z.infer<typeof whatsappVincularSchema>;

// --------------------------------------------------------------------------
// Mensagens
// --------------------------------------------------------------------------

/**
 * Reação a uma mensagem. `deQuem` só tem dois valores porque o atendimento é
 * 1:1 — e é o que a tela usa para posicionar o emoji do lado certo da bolha.
 */
export const whatsappReacaoSchema = z.object({
  emoji: z.string(),
  deQuem: z.enum(["nos", "contato"]),
});
export type WhatsappReacao = z.infer<typeof whatsappReacaoSchema>;

export const whatsappMensagemSchema = z.object({
  id: z.string().uuid(),
  conversaId: z.string().uuid(),
  externoId: z.string(),
  direcao: whatsappDirecaoSchema,
  tipo: whatsappTipoMensagemSchema,
  conteudo: z.string().nullable(),
  arquivoUrl: z.string().nullable(),
  arquivoNome: z.string().nullable(),
  enviadaPor: z.string().uuid().nullable(),
  enviadaPorNome: z.string().nullable(),
  autorNome: z
    .string()
    .nullable()
    .describe("Nome do perfil que enviou a mensagem, contato ou atendente"),
  statusEntrega: whatsappStatusEntregaSchema,
  /** Id externo da mensagem citada — o "responder" do WhatsApp. */
  respondeuA: z.string().nullable(),
  /** No máximo duas (uma de cada lado): reagir de novo substitui. */
  reacoes: z.array(whatsappReacaoSchema).default([]),
  criadaEm: z.string().datetime(),
});
export type WhatsappMensagem = z.infer<typeof whatsappMensagemSchema>;

/**
 * Reagir a uma mensagem. **Emoji vazio remove** — é como o WhatsApp desfaz, e
 * manter a convenção evita uma segunda rota só para isso.
 */
export const whatsappReagirSchema = z.object({
  emoji: z.string().trim().max(16),
});
export type WhatsappReagir = z.infer<typeof whatsappReagirSchema>;

/**
 * Os emojis que a tela oferece — os mesmos seis do WhatsApp, na mesma ordem.
 * Um seletor completo de emoji é outra conversa; estes cobrem o uso real.
 */
export const WHATSAPP_REACOES_RAPIDAS = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🙏",
] as const;

export const whatsappMensagemQuerySchema = z.object({
  // Paginação por cursor: o rolo carrega para trás, e offset numa lista que
  // cresce pela ponta faz a mesma mensagem aparecer duas vezes.
  antesDe: z.string().datetime().optional(),
  tamanho: z.coerce.number().int().min(1).max(100).default(50),
});
export type WhatsappMensagemQuery = z.infer<typeof whatsappMensagemQuerySchema>;

export const whatsappEnviarSchema = z.object({
  texto: z.string().trim().min(1, "Mensagem vazia").max(4096),
  /** Id externo da mensagem citada — é o "responder" do WhatsApp. */
  respondeuA: z.string().optional(),
});
export type WhatsappEnviar = z.infer<typeof whatsappEnviarSchema>;

/** Anexo de conversa. O arquivo vai no multipart; isto é o resto do corpo. */
export const whatsappEnviarArquivoSchema = z.object({
  legenda: z.string().trim().max(1024).optional(),
  ptt: z.coerce
    .boolean()
    .default(false)
    .describe("Áudio gravado na hora — vira mensagem de voz, não anexo"),
});
export type WhatsappEnviarArquivo = z.infer<typeof whatsappEnviarArquivoSchema>;

// --------------------------------------------------------------------------
// Mensagens agendadas
// --------------------------------------------------------------------------

export const whatsappAgendamentoStatusSchema = z.enum([
  "pendente",
  "enviando",
  "enviada",
  "erro",
  "cancelada",
]);
export type WhatsappAgendamentoStatus = z.infer<
  typeof whatsappAgendamentoStatusSchema
>;

/**
 * Mensagem escrita agora para sair depois — a cobrança de segunda de manhã, o
 * retorno combinado para a semana que vem.
 *
 * Só texto: anexo agendado exigiria segurar o arquivo no servidor até a hora,
 * e a regra de retenção do módulo trata do que já foi enviado, não do que
 * ainda vai. Fica registrado como limite consciente.
 */
export const whatsappAgendarMensagemSchema = z.object({
  texto: z.string().trim().min(1, "Mensagem vazia").max(4096),
  enviarEm: z.coerce.date().refine((d) => d.getTime() > Date.now(), {
    message: "Escolha uma data e hora no futuro",
  }),
});
export type WhatsappAgendarMensagem = z.infer<
  typeof whatsappAgendarMensagemSchema
>;

export const whatsappMensagemAgendadaSchema = z.object({
  id: z.string().uuid(),
  conversaId: z.string().uuid(),
  texto: z.string(),
  enviarEm: z.string().datetime(),
  status: whatsappAgendamentoStatusSchema,
  erro: z.string().nullable(),
  criadaPor: z.string().uuid(),
  criadaPorNome: z.string().nullable(),
  criadaEm: z.string().datetime(),
});
export type WhatsappMensagemAgendada = z.infer<
  typeof whatsappMensagemAgendadaSchema
>;

/** Teto do WhatsApp para anexo; a tela avisa antes de subir o arquivo. */
export const WHATSAPP_ARQUIVO_MAX_BYTES = 16 * 1024 * 1024;

// --------------------------------------------------------------------------
// Ações do sistema dentro da conversa
// --------------------------------------------------------------------------

/**
 * Agendamento feito de dentro da conversa. Cliente e vendedor não vêm no
 * corpo: são os da própria conversa — deixar escolher aqui abriria caminho
 * para agendar visita no nome de outro vendedor.
 */
export const whatsappAgendarVisitaSchema = z.object({
  tipo: z
    .enum(["visita", "ligacao", "reuniao", "tarefa", "email"])
    .default("visita"),
  titulo: z.string().trim().min(1, "Informe o que será feito").max(150),
  descricao: z.string().trim().max(1000).optional(),
  dataVencimento: z.coerce.date().nullable().optional(),
});
export type WhatsappAgendarVisita = z.infer<typeof whatsappAgendarVisitaSchema>;

/**
 * Envio da proposta comercial em PDF pela conversa. Só o orçamento é
 * escolhido: o cliente é o da conversa, e o servidor recusa orçamento de
 * outro cliente. Sem legenda, a mensagem sai com "Orçamento nº N".
 */
export const whatsappEnviarOrcamentoSchema = z.object({
  orcamentoId: z.string().uuid("Escolha o orçamento a enviar"),
  legenda: z.string().trim().max(1000).optional(),
});
export type WhatsappEnviarOrcamento = z.infer<
  typeof whatsappEnviarOrcamentoSchema
>;

/**
 * Orçamento montado de dentro da conversa.
 *
 * Cliente e vendedor **não** vêm no corpo: são os da conversa. É a mesma
 * regra do agendamento — deixar escolher aqui abriria caminho para orçar no
 * nome de outro vendedor, ou para outro cliente que não o do atendimento.
 *
 * Só o essencial da proposta: o cadastro completo (oportunidade, comissão,
 * regra de desconto por item) continua na tela de Orçamentos, que é onde ele
 * cabe. Aqui é o que o vendedor consegue montar no meio de uma conversa.
 */
export const whatsappNovoOrcamentoSchema = z.object({
  titulo: z.string().trim().min(1, "Informe um título").max(150),
  condicaoPagamentoId: z.string().uuid().nullable().optional(),
  dataValidade: z.coerce.date().nullable().optional(),
  observacao: z.string().trim().max(1000).optional(),
  itens: z
    .array(
      z.object({
        produtoId: z.string().uuid(),
        quantidade: z.coerce.number().int().positive("Informe a quantidade"),
        vlrUnitario: z.coerce.number().min(0, "Informe o preço unitário"),
      }),
    )
    .min(1, "Inclua ao menos um produto"),
  /** Manda a proposta em PDF logo depois de criar — o caminho mais comum. */
  enviar: z.boolean().default(true),
});
export type WhatsappNovoOrcamento = z.infer<typeof whatsappNovoOrcamentoSchema>;

/**
 * 2ª via de DANFE anexada na conversa (ver
 * `docs/planos/segunda-via-danfe-boleto.md`).
 *
 * Como no orçamento, só o documento é escolhido: o cliente é o da conversa, e
 * o servidor recusa nota que não seja dele — um id válido de outro cliente da
 * carteira mandaria a nota fiscal errada para a pessoa errada.
 */
export const whatsappEnviarDanfeSchema = z.object({
  notaSaidaId: z.string().uuid("Escolha a nota fiscal a enviar"),
  legenda: z.string().trim().max(1000).optional(),
  /** Manda também o XML — o que o contador do cliente costuma pedir. */
  incluirXml: z.boolean().default(false),
});
export type WhatsappEnviarDanfe = z.infer<typeof whatsappEnviarDanfeSchema>;

/**
 * 2ª via de boleto anexada na conversa.
 *
 * Vencido, sai com valor atualizado; passados 30 dias do vencimento, o
 * servidor recusa (409) — a mesma regra da rota de download.
 */
export const whatsappEnviarBoletoSchema = z.object({
  tituloReceberId: z.string().uuid("Escolha o título a enviar"),
  legenda: z.string().trim().max(1000).optional(),
});
export type WhatsappEnviarBoleto = z.infer<typeof whatsappEnviarBoletoSchema>;

// --------------------------------------------------------------------------
// Exemplos para o Swagger
// --------------------------------------------------------------------------

export const WHATSAPP_SESSAO_EXAMPLE: WhatsappSessao = {
  id: "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  empresaId: "7b2f2f64-9b1c-4a86-9d3e-1f4a5b6c7d8e",
  vendedorId: "9c8d7e6f-5a4b-4c3d-2e1f-0a9b8c7d6e5f",
  vendedorNome: "MARCOS ANTONIO",
  numero: "5567999998888",
  status: "conectada",
  transporte: "zapo",
  ultimaConexao: "2026-08-14T18:30:00.000Z",
  ultimoErro: null,
  aceiteEm: "2026-08-14T18:29:00.000Z",
  createdAt: "2026-08-14T18:29:00.000Z",
  updatedAt: "2026-08-14T18:30:00.000Z",
};

export const WHATSAPP_MENSAGEM_EXAMPLE: WhatsappMensagem = {
  id: "1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7081",
  conversaId: "2c3d4e5f-6071-4829-ab3c-4d5e6f708192",
  externoId: "3EB0C767D26B8A3F1B2C",
  direcao: "entrada",
  tipo: "texto",
  conteudo: "Bom dia, consegue me mandar o orçamento daquele item?",
  arquivoUrl: null,
  arquivoNome: null,
  reacoes: [{ emoji: "👍", deQuem: "nos" }],
  enviadaPor: null,
  enviadaPorNome: null,
  autorNome: "Cliente Demonstração",
  statusEntrega: "entregue",
  respondeuA: null,
  criadaEm: "2026-08-14T18:31:00.000Z",
};
