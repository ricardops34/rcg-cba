import { Prisma } from '@prisma/client';
import type { DemoDb } from './demo-gerador';

/**
 * Limpa **o dado de negócio** de uma empresa, preservando o que a faz
 * continuar utilizável.
 *
 * Diferente de `apagarDemo`, que remove só o conjunto `DEMO-`: aqui vai tudo
 * — cliente, produto, nota, título, orçamento, CRM, conversa —, inclusive o
 * que foi cadastrado à mão. É irreversível, e é por isso que a fronteira está
 * escrita aqui em vez de deduzida na hora.
 *
 * **Roda dentro de `withTenant`.** As policies de RLS são `USING (empresaId =
 * current_setting(...))`, então cada `deleteMany` só alcança a empresa do
 * contexto — não é o `where` desta lista que protege o vizinho, é o Postgres.
 * Chamar isto fora do `withTenant` apaga **zero** linha, em silêncio (ver
 * `apps/api/prisma/migrations/README.md`).
 */

/**
 * O que **fica**, mesmo carregando `empresaId`.
 *
 * Quatro famílias, decididas em 2026-09-19:
 *
 * - **acesso** — sem `usuario_empresas` ninguém entra, nem o administrador
 *   que pediu a limpeza;
 * - **configuração** — parâmetros, campos de tela, convênio de cobrança,
 *   horário de atendimento. Refazer isso à mão depois de cada limpeza
 *   transformaria a operação em algo que ninguém usa;
 * - **credencial e pareamento** — a chave de API do agente e a sessão de
 *   WhatsApp. Apagar obrigaria a recolar a chave e reler o QR antes de
 *   demonstrar;
 * - **auditoria** — registro de quem fez o quê. Uma operação destrutiva que
 *   apaga a própria trilha é exatamente o que a trilha existe para impedir.
 */
const PRESERVADOS = [
  // acesso e sessão
  'UsuarioEmpresa',
  'RefreshToken',
  'Sessao',
  'TourExecucao',
  // auditoria e logs
  'AcessoLog',
  'PlataformaAuditoria',
  'ErroLog',
  // configuração da empresa
  'ParametroEmpresa',
  'IntegracaoApiKey',
  'OrcamentoConfig',
  'ClienteCampoConfig',
  'ProdutoCampo',
  'EmpresaHorarioAtendimento',
  'Feriado',
  // quais módulos e telas esta empresa usa — configuração do menu dela, não
  // dado de negócio: uma demonstração recomeça com os mesmos módulos ligados
  'EmpresaModulo',
  'EmpresaMenu',
  'EmpresaRotina',
  // contrato comercial da empresa e a trilha de acesso do suporte: o primeiro
  // é o que ela assinou, os outros dois são auditoria — nada disso é dado de
  // demonstração
  'Assinatura',
  'EmpresaSuporteAcesso',
  'EmpresaSuporteLog',
  // agente de IA: configuração, credencial e governança
  'AgenteConfig',
  'AgenteCredencial',
  'AgenteFerramenta',
  'AgenteFerramentaAuditoria',
  'AgenteFerramentaPerfil',
  // WhatsApp: o aparelho pareado e o que o configura
  'WhatsappConfig',
  'WhatsappSessao',
  'WhatsappTemplate',
  // Atalhos de resposta (`/pix`, `/catalogo`): texto que a empresa escreveu
  // para atender mais rápido, não conversa. Mesma família do template — quem
  // pede "limpar a base" não está pedindo para reescrever os atalhos.
  'WhatsappRespostaRapida',
  'WhatsappVinculoFuncionario',
  // Portal do Cliente: a configuração, não as credenciais dos clientes
  'PortalClienteConfig',
  'PortalClientePerfil',
  'PortalClientePerfilPermissao',
] as const;

/**
 * O que é apagado, **na ordem em que tem de ser**: filho antes de pai.
 *
 * A ordem não é estética. Um `deleteMany` fora de ordem estoura a chave
 * estrangeira, e dentro de uma transação do Postgres o primeiro erro aborta
 * tudo o que veio antes — não há como tentar de novo no meio.
 */
const ORDEM_DE_EXCLUSAO = [
  // --- o que o assistente conversou (aponta para cliente e produto) --------
  'AgenteMensagem',
  'AgenteConversa',
  'AgenteAnexo',
  // --- WhatsApp: mensagens e conversas, não o aparelho --------------------
  'WhatsappReacao',
  'WhatsappMensagemAgendada',
  'WhatsappAcaoRegistro',
  'WhatsappMensagem',
  'WhatsappConversa',
  'WhatsappRecadoDestinatario',
  'WhatsappRecadoInterno',
  'WhatsappContato',
  // --- movimento ----------------------------------------------------------
  'NotaSaidaItem',
  'NotaSaidaXml',
  'NotaSaida',
  'NotaEntradaItem',
  'NotaEntrada',
  'TituloReceber',
  'OrcamentoItem',
  'Orcamento',
  // --- metas --------------------------------------------------------------
  'ObjetivoVendedorCategoria',
  'ObjetivoVendedorMes',
  // --- CRM ----------------------------------------------------------------
  'Atividade',
  'Oportunidade',
  'Lead',
  'SugestaoCompraGerada',
  'Notificacao',
  // --- mural --------------------------------------------------------------
  'ComunicadoPerfil',
  'Comunicado',
  // --- cliente e o que pende dele ----------------------------------------
  'PortalClienteAcessoLog',
  'PortalClienteCredencial',
  'PortalClienteHabilitacao',
  'ClienteAlteracao',
  'ClienteHistorico',
  'ClienteCnae',
  'ClienteContato',
  'Cliente',
  // --- produto e o que pende dele ----------------------------------------
  'ProdutoFichaTrecho',
  'ProdutoFichaImportacao',
  'ProdutoFicha',
  'ProdutoFoto',
  'ProdutoRelacionado',
  'ProdutoCampoValor',
  'Estoque',
  'TabelaPrecoItem',
  'TabelaPreco',
  'RegraDescontoFaixa',
  'RegraDesconto',
  'Produto',
  // --- cadastros de apoio -------------------------------------------------
  'Armazem',
  'Categoria',
  'CondicaoPagamento',
  'ContaBancaria',
  'Fornecedor',
  // --- por último: a carteira ---------------------------------------------
  // Vendedor sai depois de tudo o que o referencia. O usuário fica (é acesso);
  // o que some é o cadastro comercial dele, como numa base recém-criada.
  'Vendedor',
] as const;

/** Nome do modelo → o delegate do Prisma (`Cliente` → `cliente`). */
function delegate(db: DemoDb, modelo: string) {
  const chave = modelo.charAt(0).toLowerCase() + modelo.slice(1);
  const alvo = (db as unknown as Record<string, unknown>)[chave];
  if (
    !alvo ||
    typeof (alvo as { deleteMany?: unknown }).deleteMany !== 'function'
  ) {
    throw new Error(`Modelo "${modelo}" não existe no cliente Prisma.`);
  }
  return alvo as { deleteMany: (args?: unknown) => Promise<{ count: number }> };
}

/**
 * Toda tabela com `empresaId` está classificada?
 *
 * Esta é a trava que mantém as listas corretas com o tempo. Uma tabela de
 * negócio nova que ninguém classificou sobreviveria à limpeza em silêncio — e
 * "limpei a base" com cliente antigo sobrando é pior do que não ter limpado,
 * porque a demonstração começa com dado de outro assunto no meio.
 *
 * Roda a partir do DMMF, então não precisa de banco: o teste
 * `demo-limpeza.spec.ts` a executa a cada build.
 */
export function conferirClassificacao(): {
  naoClassificados: string[];
  duplicados: string[];
} {
  const comEmpresa = Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'empresaId'))
    .map((m) => m.name);

  const preservados = new Set<string>(PRESERVADOS);
  const excluidos = new Set<string>(ORDEM_DE_EXCLUSAO);

  return {
    naoClassificados: comEmpresa.filter(
      (m) => !preservados.has(m) && !excluidos.has(m),
    ),
    duplicados: comEmpresa.filter(
      (m) => preservados.has(m) && excluidos.has(m),
    ),
  };
}

export interface ResumoLimpeza {
  /** Quantas linhas caíram, por tabela. Só as que tinham alguma. */
  apagados: { tabela: string; linhas: number }[];
  total: number;
}

/**
 * Apaga o dado de negócio da empresa do contexto.
 *
 * Não recebe `empresaId`: quem define o alcance é a transação. Aceitar o id
 * aqui sugeriria que ele filtra alguma coisa — e um id que não fosse o do
 * contexto simplesmente não apagaria nada, o que é pior do que não aceitar.
 */
export async function limparBaseDaEmpresa(db: DemoDb): Promise<ResumoLimpeza> {
  // Falha antes de apagar a primeira linha: tabela não classificada é erro de
  // programação, e descobrir isso no meio da limpeza deixaria a base pela
  // metade.
  const { naoClassificados, duplicados } = conferirClassificacao();
  if (naoClassificados.length || duplicados.length) {
    throw new Error(
      'Classificação da limpeza desatualizada — ver demo-limpeza.ts. ' +
        (naoClassificados.length
          ? `Sem classificação: ${naoClassificados.join(', ')}. `
          : '') +
        (duplicados.length
          ? `Em ambas as listas: ${duplicados.join(', ')}.`
          : ''),
    );
  }

  const apagados: { tabela: string; linhas: number }[] = [];
  for (const modelo of ORDEM_DE_EXCLUSAO) {
    const { count } = await delegate(db, modelo).deleteMany();
    if (count > 0) apagados.push({ tabela: modelo, linhas: count });
  }

  return {
    apagados,
    total: apagados.reduce((soma, a) => soma + a.linhas, 0),
  };
}
