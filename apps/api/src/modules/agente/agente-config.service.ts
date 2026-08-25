import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import { ProvedorFactory } from './provedor.factory';
import { CodexOAuthService, type TokensCodex } from './codex-oauth.service';
import { cifrar, decifrar, ultimos4 } from './agente-cripto';
import {
  PROVEDORES,
  SYSTEM_PROMPT_PADRAO,
  type AgenteConfigUpdate,
  type ProvedorIa,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/** Config já resolvida para uso interno — com a credencial em claro. */
export interface ConfigParaUso {
  provedor: ProvedorIa;
  /** Identidade do agente — vale para qualquer provedor. */
  nomeAgente: string;
  baseUrl: string;
  /** Chave de API, ou o access token OAuth já renovado (Codex). */
  apiKey: string;
  /** Só para o Codex: vai no header `ChatGPT-Account-ID`. */
  contaId: string | null;
  modelo: string;
  temperatura: number;
  maxTokens: number;
  maxIteracoesFerramentas: number;
  historicoMensagens: number;
  systemPrompt: string | null;
}

/**
 * Configuração do agente por empresa (singleton, padrão do OrcamentoConfig).
 *
 * A chave de API **nunca** sai da API: a leitura devolve apenas os últimos 4
 * caracteres e a marca de preenchida.
 *
 * As credenciais ficam numa tabela por provedor (`AgenteCredencial`), não numa
 * coluna só. É o que faz trocar de provedor custar um clique: alternar entre
 * Claude e ChatGPT mantém as duas chaves gravadas, e voltar traz também o
 * modelo que estava em uso naquele provedor. O Codex ocupa a mesma linha, só
 * que com um par de tokens OAuth no lugar da chave.
 */
@Injectable()
export class AgenteConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provedores: ProvedorFactory,
    private readonly codexOauth: CodexOAuthService,
  ) {}

  async obter(empresaId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const linha = await tx.agenteConfig.upsert({
        where: { empresaId },
        // Nasce com o system prompt de exemplo preenchido: uma tela em branco
        // não diz ao administrador o que ele deveria escrever ali.
        create: { empresaId, systemPrompt: SYSTEM_PROMPT_PADRAO },
        update: {},
      });
      const credenciais = await tx.agenteCredencial.findMany({
        where: { empresaId },
        select: {
          provedor: true,
          apiKeyUltimos4: true,
          modelo: true,
          contaId: true,
          contaEmail: true,
          tokenExpiraEm: true,
          // Só a presença — o token em si nunca sai daqui.
          refreshTokenCifrado: true,
        },
      });
      return this.paraLeitura(linha, credenciais);
    });
  }

  async atualizar(
    empresaId: string,
    user: AuthenticatedUser,
    input: AgenteConfigUpdate,
  ) {
    const { apiKey, provedor, ...resto } = input;

    return this.prisma.withTenant(empresaId, async (tx) => {
      const atual = await tx.agenteConfig.upsert({
        where: { empresaId },
        create: { empresaId, systemPrompt: SYSTEM_PROMPT_PADRAO },
        update: {},
      });

      const provedorAlvo = (provedor ?? atual.provedor) as ProvedorIa;
      const info = PROVEDORES[provedorAlvo];
      if (!info) {
        throw new BadRequestException(`Provedor desconhecido: ${provedorAlvo}`);
      }

      // Chave nova grava na credencial do provedor alvo — nunca sobrescreve a
      // do outro provedor.
      if (apiKey) {
        await tx.agenteCredencial.upsert({
          where: {
            empresaId_provedor: { empresaId, provedor: provedorAlvo },
          },
          create: {
            empresaId,
            provedor: provedorAlvo,
            apiKeyCifrada: cifrar(apiKey),
            apiKeyUltimos4: ultimos4(apiKey),
            modelo: resto.modelo ?? info.modeloPadrao,
            updatedBy: user.id,
          },
          update: {
            apiKeyCifrada: cifrar(apiKey),
            apiKeyUltimos4: ultimos4(apiKey),
            updatedBy: user.id,
          },
        });
      }

      const trocouProvedor = provedor && provedor !== atual.provedor;
      // Ao trocar de provedor sem informar modelo/endpoint, herda o que já foi
      // usado naquele provedor; se for a primeira vez, usa o padrão dele.
      const credencialAlvo = trocouProvedor
        ? await tx.agenteCredencial.findUnique({
            where: {
              empresaId_provedor: { empresaId, provedor: provedorAlvo },
            },
            select: { modelo: true },
          })
        : null;

      const dados: Record<string, unknown> = {
        ...resto,
        updatedBy: user.id,
        ...(provedor ? { provedor } : {}),
        ...(trocouProvedor
          ? {
              baseUrl: resto.baseUrl ?? info.baseUrl,
              modelo:
                resto.modelo ?? credencialAlvo?.modelo ?? info.modeloPadrao,
            }
          : {}),
      };

      const linha = await tx.agenteConfig.update({
        where: { empresaId },
        data: dados as never,
      });

      // Guarda o modelo em uso na credencial, para a volta trazer a mesma
      // configuração.
      if (linha.modelo) {
        await tx.agenteCredencial.updateMany({
          where: { empresaId, provedor: linha.provedor },
          data: { modelo: linha.modelo },
        });
      }

      const credenciais = await tx.agenteCredencial.findMany({
        where: { empresaId },
        select: {
          provedor: true,
          apiKeyUltimos4: true,
          modelo: true,
          contaId: true,
          contaEmail: true,
          tokenExpiraEm: true,
          // Só a presença — o token em si nunca sai daqui.
          refreshTokenCifrado: true,
        },
      });
      return this.paraLeitura(linha, credenciais);
    });
  }

  /**
   * O mínimo que a janela do chat precisa antes da primeira pergunta.
   *
   * Separado de `obter` porque a permissão é outra: a configuração inteira é
   * de administrador e traz provedor, chave e prompt; isto aqui é para quem
   * **usa** o assistente. Sem este recorte, o vendedor tomava 403 ao abrir o
   * chat e via "Assistente" genérico, mesmo com a empresa tendo dado um nome
   * ao agente.
   *
   * Empresa sem configuração ainda não ativou o agente — responde desligado,
   * em vez de estourar.
   */
  async apresentacao(empresaId: string) {
    const linha = await this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteConfig.findUnique({
        where: { empresaId },
        select: { ativo: true, nomeAgente: true, mensagemBoasVindas: true },
      }),
    );
    return {
      ativo: linha?.ativo ?? false,
      nomeAgente: linha?.nomeAgente ?? 'Assistente',
      mensagemBoasVindas: linha?.mensagemBoasVindas ?? null,
    };
  }

  /** Uso interno pelo chat. Recusa cedo e com motivo legível. */
  async paraUso(empresaId: string): Promise<ConfigParaUso> {
    const linha = await this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteConfig.findUnique({ where: { empresaId } }),
    );
    if (!linha || !linha.ativo) {
      throw new BadRequestException(
        'O agente de IA está desativado. Ative em Administração > Agente IA.',
      );
    }

    const provedor = linha.provedor as ProvedorIa;
    const comum = {
      provedor,
      nomeAgente: linha.nomeAgente,
      baseUrl: linha.baseUrl,
      modelo: linha.modelo,
      temperatura: linha.temperatura,
      maxTokens: linha.maxTokens,
      maxIteracoesFerramentas: linha.maxIteracoesFerramentas,
      historicoMensagens: linha.historicoMensagens,
      systemPrompt: linha.systemPrompt,
    };

    if (PROVEDORES[provedor]?.autenticacao === 'oauth') {
      const { accessToken, contaId } = await this.acessoOauth(
        empresaId,
        provedor,
      );
      return { ...comum, apiKey: accessToken, contaId };
    }

    const apiKey = await this.prisma.withTenant(empresaId, (tx) =>
      this.chaveDe(tx, empresaId, provedor),
    );
    if (!apiKey) {
      throw new BadRequestException(
        `A chave de API do provedor ${PROVEDORES[provedor]?.rotulo ?? provedor} não está configurada. ` +
          'Informe-a em Administração > Agente IA.',
      );
    }
    return { ...comum, apiKey, contaId: null };
  }

  /**
   * Access token válido do provedor OAuth, renovando quando preciso.
   *
   * A renovação acontece **fora** de qualquer transação: é uma chamada de rede
   * a outro serviço, e segurar uma transação aberta esperando por ela é o
   * caminho conhecido para estourar o timeout do Prisma e prender conexão do
   * pool.
   */
  private async acessoOauth(
    empresaId: string,
    provedor: ProvedorIa,
  ): Promise<{ accessToken: string; contaId: string | null }> {
    const credencial = await this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteCredencial.findUnique({
        where: { empresaId_provedor: { empresaId, provedor } },
        select: {
          accessTokenCifrado: true,
          refreshTokenCifrado: true,
          contaId: true,
          tokenExpiraEm: true,
        },
      }),
    );

    if (!credencial?.refreshTokenCifrado) {
      throw new BadRequestException(
        `A conta do provedor ${PROVEDORES[provedor]?.rotulo ?? provedor} não está conectada. ` +
          'Conecte em Administração > Agente IA.',
      );
    }

    if (
      !this.codexOauth.precisaRenovar(credencial.tokenExpiraEm) &&
      credencial.accessTokenCifrado
    ) {
      return {
        accessToken: decifrar(credencial.accessTokenCifrado),
        contaId: credencial.contaId,
      };
    }

    const tokens = await this.codexOauth.renovar(
      decifrar(credencial.refreshTokenCifrado),
    );
    await this.gravarTokens(empresaId, provedor, tokens, null);
    return {
      accessToken: tokens.accessToken,
      // O refresh nem sempre devolve id_token; mantém a conta já conhecida.
      contaId: tokens.contaId ?? credencial.contaId,
    };
  }

  /**
   * Grava (ou atualiza) o par de tokens do provedor OAuth.
   *
   * O refresh token **rotaciona a cada renovação**, e a OpenAI invalida o
   * anterior. Consequência prática que vale saber: API e Codex CLI na mesma
   * conta disputam esse token — quando um renova, o outro pode precisar de um
   * novo login.
   */
  private async gravarTokens(
    empresaId: string,
    provedor: ProvedorIa,
    tokens: TokensCodex,
    usuarioId: string | null,
  ): Promise<void> {
    const dados = {
      accessTokenCifrado: cifrar(tokens.accessToken),
      refreshTokenCifrado: cifrar(tokens.refreshToken),
      tokenExpiraEm: tokens.expiraEm,
      ...(tokens.contaId ? { contaId: tokens.contaId } : {}),
      ...(tokens.contaEmail ? { contaEmail: tokens.contaEmail } : {}),
      ...(usuarioId ? { updatedBy: usuarioId } : {}),
    };

    await this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteCredencial.upsert({
        where: { empresaId_provedor: { empresaId, provedor } },
        create: {
          empresaId,
          provedor,
          modelo: PROVEDORES[provedor]?.modeloPadrao ?? null,
          ...dados,
        },
        update: dados,
      }),
    );
  }

  // ---------------- conexão OAuth (Codex) ----------------

  /**
   * Passo 1: devolve a URL de autorização para o administrador abrir.
   *
   * O `redirect_uri` aponta para `localhost:1455` e não pode ser trocado (é o
   * cliente OAuth do CLI oficial), então o navegador vai terminar numa página
   * de erro de conexão — é o esperado. O que importa é a URL da barra de
   * endereço, que o passo 2 recebe.
   */
  iniciarOauth(empresaId: string, provedor: ProvedorIa = 'codex') {
    this.exigirOauth(provedor);
    return this.codexOauth.iniciar(empresaId);
  }

  /** Passo 2: recebe a URL de retorno colada e grava a conexão. */
  async concluirOauth(
    empresaId: string,
    user: AuthenticatedUser,
    retorno: string,
    provedor: ProvedorIa = 'codex',
  ) {
    this.exigirOauth(provedor);
    const tokens = await this.codexOauth.concluir(empresaId, retorno);
    await this.gravarTokens(empresaId, provedor, tokens, user.id);
    return this.obter(empresaId);
  }

  /** Caminho alternativo: importar a sessão do Codex CLI já logado. */
  async importarOauth(
    empresaId: string,
    user: AuthenticatedUser,
    conteudo: string,
    provedor: ProvedorIa = 'codex',
  ) {
    this.exigirOauth(provedor);
    const tokens = await this.codexOauth.importar(conteudo);
    await this.gravarTokens(empresaId, provedor, tokens, user.id);
    return this.obter(empresaId);
  }

  /**
   * Desconecta a conta. Apaga os tokens em vez de só marcar desconectado —
   * credencial de terceiro parada no banco não tem por que continuar lá.
   */
  async desconectarOauth(
    empresaId: string,
    user: AuthenticatedUser,
    provedor: ProvedorIa = 'codex',
  ) {
    this.exigirOauth(provedor);
    await this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteCredencial.updateMany({
        where: { empresaId, provedor },
        data: {
          accessTokenCifrado: null,
          refreshTokenCifrado: null,
          contaId: null,
          contaEmail: null,
          tokenExpiraEm: null,
          updatedBy: user.id,
        },
      }),
    );
    return this.obter(empresaId);
  }

  private exigirOauth(provedor: ProvedorIa): void {
    if (PROVEDORES[provedor]?.autenticacao !== 'oauth') {
      throw new BadRequestException(
        `O provedor ${PROVEDORES[provedor]?.rotulo ?? provedor} usa chave de API, não conexão de conta.`,
      );
    }
  }

  /**
   * Chave do provedor. Só a tabela por provedor — sem fallback para a coluna
   * antiga de `AgenteConfig`.
   *
   * O fallback existia e estava **errado**: a coluna legada não guardava a que
   * provedor a chave pertencia, então a comparação só podia ser com o provedor
   * *ativo* — que muda exatamente quando se troca de provedor. Na prática, ao
   * trocar para a Anthropic o sistema mandava a chave da Groq para lá. A
   * migration `agente_credencial_legada` moveu essas chaves para cá com o
   * provedor correto e zerou a coluna.
   */
  private async chaveDe(
    tx: TenantTx,
    empresaId: string,
    provedor: ProvedorIa,
  ): Promise<string | null> {
    const credencial = await tx.agenteCredencial.findUnique({
      where: { empresaId_provedor: { empresaId, provedor } },
      select: { apiKeyCifrada: true },
    });
    // Nulo é o normal agora: a credencial do provedor OAuth existe sem chave.
    return credencial?.apiKeyCifrada
      ? decifrar(credencial.apiKeyCifrada)
      : null;
  }

  /**
   * Testa a chave contra o provedor e devolve os modelos da conta — é o que
   * permite validar o campo `modelo` contra a realidade em vez de uma lista
   * fixa no código.
   */
  async testarConexao(
    empresaId: string,
    apiKeyInformada?: string,
    provedorInformado?: ProvedorIa,
  ) {
    const config = await this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteConfig.findUnique({ where: { empresaId } }),
    );
    const alvo =
      provedorInformado ?? ((config?.provedor ?? 'anthropic') as ProvedorIa);

    // Provedor OAuth não tem chave para validar nem endpoint de modelos. O
    // teste que faz sentido é outro: renovar o token de verdade. Se o refresh
    // foi revogado do lado da OpenAI, é aqui que isso aparece — em vez de na
    // próxima pergunta de um vendedor.
    if (PROVEDORES[alvo]?.autenticacao === 'oauth') {
      const { contaId } = await this.acessoOauth(empresaId, alvo);
      return {
        ok: true,
        provedor: alvo,
        modelos: [...(PROVEDORES[alvo].modelos ?? [])],
        contaId,
      };
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      const linha = config;
      const provedor = alvo;
      const info = PROVEDORES[provedor];
      const baseUrl =
        provedor === (linha?.provedor as ProvedorIa)
          ? (linha?.baseUrl ?? info.baseUrl)
          : info.baseUrl;

      // Permite testar uma chave antes de gravá-la.
      const apiKey = apiKeyInformada
        ? apiKeyInformada
        : linha
          ? await this.chaveDe(tx, empresaId, provedor)
          : null;
      if (!apiKey) {
        throw new BadRequestException(
          'Informe a chave de API para testar, ou grave-a primeiro.',
        );
      }
      const modelos = await this.provedores
        .para(provedor)
        .listarModelos(baseUrl, apiKey);
      return { ok: true, provedor, modelos };
    });
  }

  private paraLeitura(
    linha: {
      id: string;
      empresaId: string;
      ativo: boolean;
      nomeAgente: string;
      mensagemBoasVindas: string | null;
      provedor: string;
      baseUrl: string;
      modelo: string;
      apiKeyUltimos4: string | null;
      apiKeyCifrada: string | null;
      systemPrompt: string | null;
      temperatura: number;
      maxTokens: number;
      maxIteracoesFerramentas: number;
      historicoMensagens: number;
    },
    credenciais: {
      provedor: string;
      apiKeyUltimos4: string | null;
      modelo: string | null;
      contaId: string | null;
      contaEmail: string | null;
      tokenExpiraEm: Date | null;
      refreshTokenCifrado: string | null;
    }[],
  ) {
    const doProvedor = credenciais.find((c) => c.provedor === linha.provedor);
    return {
      id: linha.id,
      empresaId: linha.empresaId,
      ativo: linha.ativo,
      nomeAgente: linha.nomeAgente,
      mensagemBoasVindas: linha.mensagemBoasVindas,
      provedor: linha.provedor,
      baseUrl: linha.baseUrl,
      modelo: linha.modelo,
      apiKeyUltimos4: doProvedor?.apiKeyUltimos4 ?? null,
      apiKeyPreenchida: !!doProvedor?.apiKeyUltimos4,
      systemPrompt: linha.systemPrompt,
      temperatura: linha.temperatura,
      maxTokens: linha.maxTokens,
      maxIteracoesFerramentas: linha.maxIteracoesFerramentas,
      historicoMensagens: linha.historicoMensagens,
      // A tela usa isto para mostrar quais provedores já têm chave gravada —
      // é o que torna a troca um clique em vez de uma recolagem.
      credenciais: credenciais.map((c) => ({
        provedor: c.provedor,
        apiKeyUltimos4: c.apiKeyUltimos4,
        apiKeyPreenchida: !!c.apiKeyUltimos4,
        modelo: c.modelo,
        contaId: c.contaId,
        contaEmail: c.contaEmail,
        tokenExpiraEm: c.tokenExpiraEm?.toISOString() ?? null,
        // Conectado é ter o refresh token: o access token vive horas e ser
        // renovado é rotina, então a presença dele não diz nada.
        conectado: !!c.refreshTokenCifrado,
      })),
    };
  }
}
