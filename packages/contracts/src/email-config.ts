import { z } from "zod";

/**
 * Tela Administração > E-mail: os parâmetros SMTP_* e EMAIL_* da empresa
 * editados juntos, no mesmo desenho do SMS (decisão do usuário, 01/10/2026 —
 * sem tabela própria). A senha do SMTP nunca volta para a tela.
 */
export const emailConfiguracaoUpdateSchema = z.object({
  ativo: z.boolean().describe("EMAIL_ATIVO — habilita o envio de e-mail nesta empresa"),
  host: z.string().trim().max(120).describe("SMTP_HOST — vazio usa o servidor do ambiente"),
  porta: z.coerce.number().int().min(1).max(65535).nullable().describe("SMTP_PORTA"),
  seguro: z.boolean().describe("SMTP_SEGURO — SSL/TLS direto (porta 465)"),
  usuario: z.string().trim().max(120).describe("SMTP_USUARIO"),
  senha: z
    .string()
    .max(120)
    .optional()
    .describe("SMTP_SENHA — só quando for trocar; vazio mantém a atual"),
  remetente: z.string().trim().max(150).describe("SMTP_REMETENTE"),
  documentos: z.boolean().describe("EMAIL_DOCUMENTOS — DANFE e XML"),
  boleto: z.boolean().describe("EMAIL_BOLETO"),
  cobranca: z.boolean().describe("EMAIL_COBRANCA"),
  senhaProvisoria: z.boolean().describe("EMAIL_SENHA_PROVISORIA"),
});
export type EmailConfiguracaoUpdate = z.infer<typeof emailConfiguracaoUpdateSchema>;

export type EmailConfiguracao = Omit<EmailConfiguracaoUpdate, "senha"> & {
  senhaPreenchida: boolean;
  /** Sem SMTP_HOST da empresa, vale o servidor do ambiente (se houver). */
  usaServidorDoAmbiente: boolean;
  /** Há servidor para enviar: o da empresa ou o do ambiente. */
  smtpConfigurado: boolean;
  /** EMAIL_ATIVO e SMTP configurado. */
  habilitado: boolean;
};

/** O que a tela pode mostrar: cada botão de e-mail só aparece com o seu ligado. */
export type EmailDisponibilidade = {
  habilitado: boolean;
  documentos: boolean;
  boleto: boolean;
  cobranca: boolean;
  senhaProvisoria: boolean;
};

export type EmailTesteResultado = { enviadoPara: string };

/**
 * Modelos de e-mail e identidade visual editáveis por empresa (Administração > E-mail).
 * Gravados como parâmetros EMAIL_MODELO_* sem migration (mesmo padrão do SMS e SMTP).
 */
export const EMAIL_MODELOS_DISPONIVEIS = ["cobranca", "nota", "boleto"] as const;
export type EmailModeloTipo = (typeof EMAIL_MODELOS_DISPONIVEIS)[number];

export const emailModelosUpdateSchema = z.object({
  cobrancaAssunto: z.string().trim().max(200).optional().describe("EMAIL_MODELO_COBRANCA_ASSUNTO"),
  cobrancaTexto: z.string().trim().max(2000).optional().describe("EMAIL_MODELO_COBRANCA_TEXTO"),
  notaAssunto: z.string().trim().max(200).optional().describe("EMAIL_MODELO_NOTA_ASSUNTO"),
  notaTexto: z.string().trim().max(2000).optional().describe("EMAIL_MODELO_NOTA_TEXTO"),
  boletoAssunto: z.string().trim().max(200).optional().describe("EMAIL_MODELO_BOLETO_ASSUNTO"),
  boletoTexto: z.string().trim().max(2000).optional().describe("EMAIL_MODELO_BOLETO_TEXTO"),
  corCabecalho: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Cor deve estar no formato hexadecimal (#rrggbb)")
    .nullable()
    .optional()
    .describe("EMAIL_COR_CABECALHO — cor da barra de topo do e-mail"),
  replyToUsuario: z.boolean().optional().describe("EMAIL_REPLY_TO_USUARIO — respostas vão para o colaborador"),
  incluirAssinaturaUsuario: z
    .boolean()
    .optional()
    .describe("EMAIL_ASSINATURA_USUARIO — exibe card com nome/contato do colaborador"),
  incluirTelefoneUsuario: z
    .boolean()
    .optional()
    .describe("EMAIL_ASSINATURA_TELEFONE — exibe WhatsApp/telefone do colaborador na assinatura"),
  incluirEmailUsuario: z
    .boolean()
    .optional()
    .describe("EMAIL_ASSINATURA_EMAIL — exibe e-mail do colaborador na assinatura"),
});
export type EmailModelosUpdate = z.infer<typeof emailModelosUpdateSchema>;

export type EmailModelosConfiguracao = {
  cobrancaAssunto: string;
  cobrancaTexto: string;
  notaAssunto: string;
  notaTexto: string;
  boletoAssunto: string;
  boletoTexto: string;
  corCabecalho: string | null;
  replyToUsuario: boolean;
  incluirAssinaturaUsuario: boolean;
  incluirTelefoneUsuario: boolean;
  incluirEmailUsuario: boolean;
};

export const EMAIL_MODELOS_PADRAO = {
  cobrancaAssunto: "Títulos em atraso — {{empresa.nomeFantasia}}",
  cobrancaTexto:
    "Consta em nosso sistema o(s) título(s) abaixo em aberto. Caso o pagamento já tenha sido efetuado recentemente, por favor desconsidere este aviso.",
  notaAssunto: "NF {{nota.numero}} — {{empresa.nomeFantasia}}",
  notaTexto:
    "Segue a 2ª via da nota fiscal {{nota.numero}}, com o DANFE em PDF e o arquivo XML autorizado.",
  boletoAssunto: "Boleto do título {{boleto.numero}} — {{empresa.nomeFantasia}}",
  boletoTexto:
    "Segue a 2ª via do boleto do título {{boleto.numero}} com as instruções para pagamento.",
  corCabecalho: null,
  replyToUsuario: true,
  incluirAssinaturaUsuario: true,
} as const;

export type EmailTagDef = {
  tag: string;
  rotulo: string;
  descricao: string;
  exemplo: string;
  categoria: "cliente" | "empresa" | "colaborador" | "documento";
};

export const EMAIL_TAGS_CATALOGO: Record<EmailModeloTipo, EmailTagDef[]> = {
  cobranca: [
    { tag: "{{cliente.nome}}", rotulo: "Nome do Cliente", descricao: "Razão social ou nome do cliente", exemplo: "MERCADO CENTRAL LTDA", categoria: "cliente" },
    { tag: "{{cliente.cnpj}}", rotulo: "CNPJ/CPF", descricao: "CNPJ ou CPF formatado", exemplo: "03.715.067/0001-09", categoria: "cliente" },
    { tag: "{{empresa.nomeFantasia}}", rotulo: "Empresa", descricao: "Nome fantasia da empresa emissora", exemplo: "RCG DISTRIBUIDORA", categoria: "empresa" },
    { tag: "{{empresa.telefone}}", rotulo: "Telefone Empresa", descricao: "Telefone de contato da empresa", exemplo: "(67) 3382-7328", categoria: "empresa" },
    { tag: "{{cobranca.quantidade}}", rotulo: "Qtd. Títulos", descricao: "Total de títulos vencidos", exemplo: "3", categoria: "documento" },
    { tag: "{{cobranca.total}}", rotulo: "Valor Total", descricao: "Valor total em atraso", exemplo: "R$ 1.890,50", categoria: "documento" },
    { tag: "{{colaborador.nome}}", rotulo: "Colaborador", descricao: "Nome do atendente que disparou", exemplo: "Ricardo Patay", categoria: "colaborador" },
    { tag: "{{colaborador.cargo}}", rotulo: "Cargo/Perfil", descricao: "Departamento ou função", exemplo: "Departamento Comercial", categoria: "colaborador" },
    { tag: "{{colaborador.telefone}}", rotulo: "WhatsApp/Tel", descricao: "Contato direto do operador", exemplo: "(67) 99988-7766", categoria: "colaborador" },
  ],
  nota: [
    { tag: "{{cliente.nome}}", rotulo: "Nome do Cliente", descricao: "Razão social ou nome do cliente", exemplo: "MERCADO CENTRAL LTDA", categoria: "cliente" },
    { tag: "{{cliente.cnpj}}", rotulo: "CNPJ/CPF", descricao: "CNPJ ou CPF formatado", exemplo: "03.715.067/0001-09", categoria: "cliente" },
    { tag: "{{empresa.nomeFantasia}}", rotulo: "Empresa", descricao: "Nome fantasia da empresa", exemplo: "RCG DISTRIBUIDORA", categoria: "empresa" },
    { tag: "{{nota.numero}}", rotulo: "Número da NF", descricao: "Número da nota fiscal", exemplo: "117179", categoria: "documento" },
    { tag: "{{nota.chave}}", rotulo: "Chave de Acesso", descricao: "Chave formatada da NFe", exemplo: "5026 0903 7150...", categoria: "documento" },
    { tag: "{{colaborador.nome}}", rotulo: "Colaborador", descricao: "Nome do operador emissor", exemplo: "Ricardo Patay", categoria: "colaborador" },
    { tag: "{{colaborador.cargo}}", rotulo: "Cargo/Perfil", descricao: "Departamento ou função", exemplo: "Atendimento a Clientes", categoria: "colaborador" },
  ],
  boleto: [
    { tag: "{{cliente.nome}}", rotulo: "Nome do Cliente", descricao: "Razão social ou nome do cliente", exemplo: "MERCADO CENTRAL LTDA", categoria: "cliente" },
    { tag: "{{empresa.nomeFantasia}}", rotulo: "Empresa", descricao: "Nome fantasia da empresa", exemplo: "RCG DISTRIBUIDORA", categoria: "empresa" },
    { tag: "{{boleto.numero}}", rotulo: "Número do Título", descricao: "Número do título/boleto", exemplo: "000117179", categoria: "documento" },
    { tag: "{{boleto.valor}}", rotulo: "Valor", descricao: "Valor nominal ou atualizado", exemplo: "R$ 450,00", categoria: "documento" },
    { tag: "{{boleto.vencimento}}", rotulo: "Vencimento", descricao: "Data de vencimento do título", exemplo: "15/10/2026", categoria: "documento" },
    { tag: "{{colaborador.nome}}", rotulo: "Colaborador", descricao: "Nome do operador emissor", exemplo: "Ricardo Patay", categoria: "colaborador" },
    { tag: "{{colaborador.telefone}}", rotulo: "WhatsApp/Tel", descricao: "Contato direto do operador", exemplo: "(67) 99988-7766", categoria: "colaborador" },
  ],
};

export const emailModeloRestaurarSchema = z.object({
  tipo: z.enum(["todos", ...EMAIL_MODELOS_DISPONIVEIS]).default("todos"),
});
export type EmailModeloRestaurar = z.infer<typeof emailModeloRestaurarSchema>;

export const emailModeloTesteSchema = z.object({
  tipo: z.enum(EMAIL_MODELOS_DISPONIVEIS),
  destinatario: z.string().email().optional(),
});
export type EmailModeloTesteInput = z.infer<typeof emailModeloTesteSchema>;

