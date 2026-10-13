import { z } from "zod";

export const termoTipoSchema = z.enum(["termos_uso", "aviso_privacidade"]);
export type TermoTipo = z.infer<typeof termoTipoSchema>;

export const termoDocumentoSchema = z.object({
  id: z.string().uuid(),
  codigo: z.string(),
  versao: z.string(),
  tipo: termoTipoSchema,
  titulo: z.string(),
  resumo: z.string(),
  conteudo: z.string(),
  conteudoHash: z.string().regex(/^[a-f0-9]{64}$/),
  vigenteEm: z.string().datetime(),
});
export type TermoDocumento = z.infer<typeof termoDocumentoSchema>;

export const termoAceiteResumoSchema = z.object({
  termoId: z.string().uuid(),
  codigo: z.string(),
  versao: z.string(),
  titulo: z.string(),
  aceitoEm: z.string().datetime(),
});
export type TermoAceiteResumo = z.infer<typeof termoAceiteResumoSchema>;

export const termosStatusSchema = z.object({
  possuiPendencia: z.boolean(),
  pendentes: z.array(termoDocumentoSchema),
  aceites: z.array(termoAceiteResumoSchema),
});
export type TermosStatus = z.infer<typeof termosStatusSchema>;

export const termoAceiteInputSchema = z.object({
  aceite: z.literal(true, {
    invalid_type_error: "É necessário confirmar a concordância com o documento",
  }),
  conteudoHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type TermoAceiteInput = z.infer<typeof termoAceiteInputSchema>;

export const termoAceiteResultSchema = z.object({
  aceito: z.literal(true),
  termoId: z.string().uuid(),
  aceitoEm: z.string().datetime(),
});
export type TermoAceiteResult = z.infer<typeof termoAceiteResultSchema>;

/**
 * Termos de uso oficiais e fixos da Plataforma Comercial (imutáveis e globais).
 * Regem a utilização da infraestrutura SaaS, segurança e integridade do software.
 */
export const TERMOS_USO_PLATAFORMA_PADRAO = `# Termos de Uso da Plataforma Comercial

## 1. Objeto
Estes Termos disciplinam o acesso e o uso da Plataforma Comercial para apoiar atividades comerciais, administrativas e de relacionamento com clientes.

## 2. Conta e Acesso
O acesso é pessoal e intransferível. O usuário deve manter suas credenciais em sigilo e comunicar ao administrador qualquer suspeita de uso indevido.

## 3. Uso Adequado
A plataforma deve ser usada somente para finalidades profissionais autorizadas, em conformidade com as permissões concedidas e com a legislação aplicável. É proibido tentar acessar dados ou funções sem autorização, interferir no serviço ou utilizar informações para finalidade ilícita.

## 4. Dados e Registros
As informações inseridas e as operações realizadas podem ser registradas para segurança, auditoria, suporte e funcionamento do serviço. O usuário é responsável pela exatidão dos dados que cadastrar e pelas ações executadas com sua conta.

## 5. Disponibilidade e Integrações
A plataforma pode depender de serviços de terceiros e passar por manutenção ou atualização. Interrupções serão tratadas com diligência, sem garantia de disponibilidade ininterrupta.

## 6. Privacidade e Segurança
Os dados pessoais são tratados para prestar, proteger e melhorar o serviço, conforme o Aviso de Privacidade aplicável. O usuário deve observar as regras internas de sua empresa ao consultar ou registrar dados pessoais.

## 7. Atualizações dos Termos
Alterações relevantes serão publicadas em uma nova versão. Quando necessário, a continuidade do uso dependerá de um novo aceite. As versões e os respectivos aceites permanecerão registrados para auditoria.

## 8. Aceite
Ao marcar a opção de concordância e selecionar **Li e concordo**, o usuário declara que leu e aceitou esta versão dos Termos de Uso. Caso não concorde, deverá sair da plataforma e procurar o administrador responsável.`;

/**
 * Modelo de sugestão padrão de Termos de Uso para Empresas / Distribuidoras.
 * Pode ser personalizado e adaptado pelo administrador de cada empresa.
 */
export const SUGESTAO_TERMOS_EMPRESA_PADRAO = `# Termos de Uso e Normas Internas — {{NOME_EMPRESA}}

## 1. Finalidade e Âmbito de Aplicação
Estes Termos de Uso e Normas Operacionais Internas regulamentam a utilização da plataforma comercial pelos colaboradores, representantes comerciais, vendedores e operadores autorizados no âmbito das operações comerciais da **{{NOME_EMPRESA}}**{{CNPJ_TEXTO}}.

## 2. Sigilo, Confidencialidade e Dados Comerciais
- **Segredo Comercial**: Todas as tabelas de preços, políticas de margem, condições de faturamento, listas de clientes e estatísticas de venda pertencem exclusivamente à **{{NOME_EMPRESA}}** e possuem caráter estritamente confidencial.
- **Vedação de Divulgação**: É vedada a exportação, cópia, captura ou repasse de informações comerciais internas a terceiros, concorrentes ou pessoas não autorizadas.
- **Responsabilidade pela Conta**: O acesso é individual e intransferível. Toda ação realizada na plataforma é vinculada ao usuário autenticado.

## 3. Emissão de Propostas, Orçamentos e Pedidos
- Os orçamentos e propostas cadastrados devem espelhar com exatidão as tratativas comerciais com os clientes.
- Descontos, bonificações, prazos elastecidos e exceções comerciais dependem de aprovação expressa pelas alçadas competentes da gerência.
- O vendedor ou emissor deve realizar a verificação cadastral e de crédito do cliente antes de confirmar o envio ou solicitação de faturamento.

## 4. Atendimento Comercial e Comunicação via WhatsApp
- Os atendimentos e mensagens trocadas através dos canais corporativos da **{{NOME_EMPRESA}}** devem primar pela cordialidade, transparência e profissionalismo.
- É estritamente proibido o envio de mensagens em massa indiscriminadas (SPAM) ou o uso das ferramentas de atendimento para assuntos alheios à atividade da empresa.

## 5. Proteção de Dados e Privacidade (LGPD)
- O tratamento de dados pessoais de clientes, compradores e parceiros observará a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
- As informações de contato e documentos só devem ser manipulados para finalidades legítimas relacionadas às propostas e vendas.

## 6. Disposições Gerais e Vigência
- O descumprimento das diretrizes aqui previstas sujeitará o infrator à suspensão de acesso e às medidas disciplinares e legais cabíveis.
- A **{{NOME_EMPRESA}}** poderá atualizar estas normas internas periodicamente, comunicando previamente aos operadores do sistema.`;

/**
 * Gera o texto sugerido de Termos de Uso da Empresa preenchendo as variáveis com os dados informados.
 */
export function gerarSugestaoTermosEmpresa(params: {
  nomeFantasia?: string | null;
  razaoSocial?: string | null;
  cnpj?: string | null;
}): string {
  const nome = (params.nomeFantasia || params.razaoSocial || "Empresa").trim();
  const cnpjLimpo = (params.cnpj || "").replace(/\D/g, "");
  const cnpjFormatado =
    cnpjLimpo.length === 14
      ? cnpjLimpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
      : cnpjLimpo.length === 11
        ? cnpjLimpo.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
        : cnpjLimpo;

  const cnpjTexto = cnpjFormatado ? ` (inscrita sob o CNPJ/CPF nº ${cnpjFormatado})` : "";

  return SUGESTAO_TERMOS_EMPRESA_PADRAO
    .replace(/\{\{NOME_EMPRESA\}\}/g, nome)
    .replace(/\{\{CNPJ_TEXTO\}\}/g, cnpjTexto);
}
