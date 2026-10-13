import { Prisma } from '@prisma/client';

/**
 * O que entra no backup de uma empresa — ver
 * `docs/planos/2026-10-13-backup-por-empresa.md`.
 *
 * Regra: **todo model com `empresaId` entra**, lido por `empresaId` dentro do
 * contexto da empresa (RLS). O que não entra está listado aqui com o motivo, e
 * o teste `backup-catalogo.spec.ts` falha quando aparece um model que não está
 * em lista nenhuma — uma tabela nova não some do backup sem ninguém decidir.
 */

/** Models sem `empresaId` que entram por outro caminho (`BackupEmpresaService`). */
export const ESPECIAIS = {
  /** A própria linha da empresa. */
  Empresa: 'a linha da empresa',
  /** Só para referência: o grupo é compartilhado por outras empresas. */
  GrupoEconomico: 'o grupo da empresa',
  /** Os usuários com vínculo (`usuario_empresas`) com a empresa, sem senha. */
  Usuario: 'os usuários vinculados à empresa',
} as const;

/** Fora do backup, com o motivo. */
export const FORA: Record<string, string> = {
  // Catálogo global da plataforma — igual para todas as empresas.
  Modulo: 'catálogo global',
  Menu: 'catálogo global',
  Rotina: 'catálogo global',
  Plano: 'catálogo global',
  PlanoModulo: 'catálogo global',
  PlanoMenu: 'catálogo global',
  PlanoRotina: 'catálogo global',
  Perfil: 'perfis são globais ou do grupo econômico',
  PerfilPermissao: 'perfis são globais ou do grupo econômico',
  PortalClienteRotina: 'catálogo global',
  TermoDocumento: 'termos da plataforma',
  TermoAceite: 'aceite é da pessoa, não da empresa',
  UsuarioHorario: 'horário é da conta do usuário, não do vínculo com a empresa',
  ErroLogConfig: 'configuração da plataforma',
  BackupEmpresaConfig: 'configuração da plataforma',
  // Referência pública, recarregável da fonte.
  Pais: 'referência pública',
  Estado: 'referência pública',
  Municipio: 'referência pública',
  Cep: 'referência pública',
  Cnae: 'referência pública',
  // Segredo ou sessão: restaurar não deve trazer de volta.
  SenhaHistorico: 'hash de senhas antigas',
  SenhaRedefinicao: 'link de redefinição de senha',
  PortalClienteSessao: 'sessão do portal',
  RefreshToken: 'sessão de login',
  Sessao: 'sessão de login',
  // Os próprios backups.
  EmpresaBackup: 'os próprios pacotes de backup',
};

/**
 * Campos que **vão vazios** (null): credencial, hash de senha, token, chave
 * cifrada. Restaurar não os traz — reconfigura-se pela tela. O teste confere
 * que todo campo de texto com cara de segredo nos models incluídos está aqui
 * ou em `NAO_SAO_SEGREDO`.
 */
export const CAMPOS_MASCARADOS: Record<string, string[]> = {
  Usuario: ['senhaHash'],
  IntegracaoApiKey: ['chaveHash'],
  PortalClienteCredencial: ['senhaHash'],
  AgenteConfig: ['apiKeyCifrada', 'embeddingApiKeyCifrada'],
  AgenteCredencial: [
    'apiKeyCifrada',
    'accessTokenCifrado',
    'refreshTokenCifrado',
  ],
  WhatsappSessao: [
    'credencialCifrada',
    'instanciaTokenCifrado',
    'webhookSegredoCifrado',
  ],
  WhatsappConfig: [
    'evolutionApiKeyCifrada',
    'cloudApiAccessTokenCifrada',
    'cloudApiAppSecretCifrada',
    'cloudApiWebhookVerifyToken',
  ],
};

/** Campos cujo nome parece segredo mas não é. */
export const NAO_SAO_SEGREDO: Record<string, string[]> = {
  /** Qual chave fez a carga — o id, não a chave. */
  IntegracaoCarga: ['apiKeyId'],
  /** Os 4 últimos caracteres, que a tela mostra para identificar a chave. */
  AgenteConfig: ['apiKeyUltimos4', 'embeddingApiKeyUltimos4'],
  AgenteCredencial: ['apiKeyUltimos4'],
};

/** Parâmetros (`parametros_empresa.parametro`) com credencial no `conteudo`. */
export const PARAMETROS_SECRETOS = ['SMTP_SENHA', 'SMS_TOKEN'];

/**
 * Campos que guardam só o **nome** do arquivo, sem o `/uploads/<pasta>/` — a
 * pasta vem daqui. Os que guardam o endereço inteiro (`/uploads/...`) são
 * achados em qualquer campo de texto.
 */
export const ARQUIVOS_POR_NOME: Record<string, Record<string, string>> = {
  ProdutoFicha: { arquivo: 'fichas' },
  ProdutoFichaImportacao: { arquivo: 'fichas-importacao' },
  AgenteAnexo: { arquivo: 'agente' },
};

export const PARECE_SEGREDO =
  /senha|hash|token|secret|segredo|cifrad|apikey|password/i;

export type ModelDoBackup = Prisma.DMMF.Model;

const models = () => Prisma.dmmf.datamodel.models as readonly ModelDoBackup[];

const temEmpresaId = (m: ModelDoBackup) =>
  m.fields.some((f) => f.name === 'empresaId');

/** Os models lidos por `empresaId`, na ordem do schema. */
export function modelsDaEmpresa(): ModelDoBackup[] {
  return models().filter((m) => temEmpresaId(m) && !(m.name in FORA));
}

export function modelPorNome(nome: string): ModelDoBackup {
  const m = models().find((x) => x.name === nome);
  if (!m) throw new Error(`Model ${nome} não existe no schema`);
  return m;
}

/** Os campos escalares (sem relações), na ordem do schema. */
export function camposEscalares(m: ModelDoBackup) {
  return m.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum');
}

/** Campos da chave primária — a ordem estável da leitura em páginas. */
export function camposDaChave(m: ModelDoBackup): string[] {
  const id = m.fields.find((f) => f.isId);
  if (id) return [id.name];
  if (m.primaryKey?.fields.length) return [...m.primaryKey.fields];
  throw new Error(`Model ${m.name} sem chave primária`);
}

/** Nome do delegate no client (`WhatsappMensagem` → `whatsappMensagem`). */
export const delegate = (nome: string) =>
  nome.charAt(0).toLowerCase() + nome.slice(1);

/** Nome da tabela no banco (`@@map`), usado no nome dos arquivos do pacote. */
export const tabela = (m: ModelDoBackup) => m.dbName ?? m.name;

/** Todos os models do schema, para o teste de cobertura. */
export const todosOsModels = () => models().map((m) => m.name);
export { temEmpresaId };
