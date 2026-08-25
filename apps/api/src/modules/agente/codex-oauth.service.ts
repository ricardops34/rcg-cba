import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Login OAuth da assinatura ChatGPT — o mesmo fluxo do `codex login`.
 *
 * Três coisas aqui não são escolha nossa, e explicam o formato incomum do
 * fluxo:
 *
 * 1. **O cliente OAuth é o do CLI oficial** (`CLIENT_ID` abaixo). Não há como
 *    registrar um cliente próprio para este backend, então herdamos as
 *    restrições dele.
 * 2. **O `redirect_uri` é fixo em `localhost:1455`.** O CLI sobe um servidor
 *    local para receber o callback; uma API numa VPS não pode. Por isso o
 *    fluxo é em duas etapas — a tela abre a URL de autorização, o redirect
 *    falha no navegador do administrador (não há nada escutando naquela porta)
 *    e ele cola a URL resultante de volta. O `code` está nos parâmetros dela.
 * 3. **O `code_verifier` do PKCE nunca sai da API.** É o que impede que o
 *    `code` colado — que passa pelo navegador e pela tela — seja suficiente
 *    para alguém trocar por um token fora daqui.
 *
 * O access token dura poucas horas; o refresh token é o que precisa
 * sobreviver, e ele é gravado cifrado por
 * [`agente-cripto.ts`](./agente-cripto.ts).
 */

const AUTORIZAR = 'https://auth.openai.com/oauth/authorize';
const TOKEN = 'https://auth.openai.com/oauth/token';

/** Cliente público do CLI oficial do Codex — ver ponto 1 no comentário acima. */
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const REDIRECT_URI = 'http://localhost:1455/auth/callback';
const ESCOPOS = 'openid profile email offline_access';

/** Janela para colar o retorno. Passou disso, o pedido some e recomeça. */
const VALIDADE_PEDIDO_MS = 10 * 60_000;

/**
 * Renova com folga em vez de esperar o vencimento: uma conversa do agente pode
 * fazer 5 chamadas em sequência, e o token vencer no meio delas devolveria 401
 * no meio do raciocínio.
 */
const FOLGA_RENOVACAO_MS = 5 * 60_000;

export interface TokensCodex {
  accessToken: string;
  refreshToken: string;
  contaId: string | null;
  contaEmail: string | null;
  expiraEm: Date;
}

interface PedidoPendente {
  verifier: string;
  empresaId: string;
  criadoEm: number;
}

interface RespostaToken {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

@Injectable()
export class CodexOAuthService {
  private readonly logger = new Logger(CodexOAuthService.name);

  /**
   * Pedidos aguardando o retorno colado, por `state`.
   *
   * Em memória de propósito: o par vive no máximo 10 minutos e não é dado de
   * negócio. **Limitação conhecida:** com mais de uma instância da API atrás de
   * um balanceador, o "concluir" precisa cair na mesma instância que fez o
   * "iniciar". Hoje a API roda como container único; se isso mudar, este mapa
   * vira uma tabela.
   */
  private readonly pendentes = new Map<string, PedidoPendente>();

  /** Monta a URL de autorização e guarda o verifier do PKCE. */
  iniciar(empresaId: string): { url: string; state: string; expiraEm: Date } {
    this.limparVencidos();

    const verifier = randomBytes(64).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomBytes(32).toString('base64url');

    this.pendentes.set(state, { verifier, empresaId, criadoEm: Date.now() });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: ESCOPOS,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      // O CLI envia estes dois; sem eles a tela de consentimento cobra passos
      // extras que só fazem sentido dentro do terminal.
      codex_cli_simplified_flow: 'true',
      id_token_add_organizations: 'true',
    });

    return {
      url: `${AUTORIZAR}?${params.toString()}`,
      state,
      expiraEm: new Date(Date.now() + VALIDADE_PEDIDO_MS),
    };
  }

  /** Troca o `code` colado pelo par de tokens. */
  async concluir(empresaId: string, retorno: string): Promise<TokensCodex> {
    this.limparVencidos();

    const { code, state } = this.extrair(retorno);
    const { chave, pedido } = this.acharPedido(empresaId, state);

    const resposta = await this.pedirToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: pedido.verifier,
    });

    // Consumido — um `code` só vale uma vez, e deixar o pedido aberto só daria
    // margem a reenvio.
    this.pendentes.delete(chave);

    return this.paraTokens(resposta, null);
  }

  /**
   * Conecta a partir do `auth.json` do Codex CLI (`~/.codex/auth.json`, ou
   * `%USERPROFILE%\.codex\auth.json` no Windows).
   *
   * Atalho para quem já usa o CLI na própria máquina: evita todo o vaivém de
   * URL do fluxo manual, que só existe porque o `redirect_uri` é fixo em
   * localhost. O que importa no arquivo é o `refresh_token` — o access token
   * dele quase sempre já venceu, então este método **ignora o access token
   * colado e renova na hora**. Além de garantir validade, é o teste do próprio
   * refresh token: se ele não valer, o erro aparece agora e não na primeira
   * pergunta do vendedor.
   */
  async importar(conteudo: string): Promise<TokensCodex> {
    const refreshToken = this.refreshDoAuthJson(conteudo);
    return this.renovar(refreshToken);
  }

  /**
   * Renova o access token. O refresh token **rotaciona**: a resposta pode
   * trazer um novo, e descartá-lo faria o próximo refresh falhar.
   */
  async renovar(refreshToken: string): Promise<TokensCodex> {
    const resposta = await this.pedirToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      scope: ESCOPOS,
    });
    return this.paraTokens(resposta, refreshToken);
  }

  /** Já venceu, ou vence dentro da folga? */
  precisaRenovar(expiraEm: Date | null): boolean {
    if (!expiraEm) return true;
    return expiraEm.getTime() - FOLGA_RENOVACAO_MS <= Date.now();
  }

  // ---------------- internos ----------------

  private async pedirToken(
    corpo: Record<string, string>,
  ): Promise<RespostaToken> {
    let resposta: Response;
    try {
      resposta = await fetch(TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(corpo).toString(),
      });
    } catch {
      throw new BadGatewayException(
        'Não foi possível falar com o servidor de login da OpenAI.',
      );
    }

    const dados = (await resposta.json().catch(() => ({}))) as RespostaToken;

    if (!resposta.ok || !dados.access_token) {
      const motivo = dados.error_description ?? dados.error ?? '';
      // Nem o code nem o token entram no log.
      this.logger.warn(`OAuth Codex: ${resposta.status} ${dados.error ?? ''}`);

      if (corpo.grant_type === 'refresh_token') {
        throw new BadGatewayException(
          'A conexão com o ChatGPT expirou ou foi revogada. ' +
            'Reconecte a conta em Administração > Agente IA.' +
            (motivo ? ` (${motivo})` : ''),
        );
      }
      throw new BadRequestException(
        'O código de autorização foi recusado. Ele vale uma única vez e expira ' +
          'em minutos — refaça a conexão desde o início.' +
          (motivo ? ` (${motivo})` : ''),
      );
    }

    return dados;
  }

  private paraTokens(
    dados: RespostaToken,
    refreshAnterior: string | null,
  ): TokensCodex {
    const refreshToken = dados.refresh_token ?? refreshAnterior;
    if (!refreshToken) {
      throw new BadGatewayException(
        'O login não devolveu o token de renovação. Refaça a conexão.',
      );
    }

    const claims = this.claimsDoIdToken(dados.id_token);
    const segundos =
      typeof dados.expires_in === 'number' ? dados.expires_in : 0;

    return {
      accessToken: dados.access_token as string,
      refreshToken,
      contaId: claims.contaId,
      contaEmail: claims.email,
      // Sem `expires_in` confiável, assume uma hora: renovar cedo demais custa
      // uma chamada; tarde demais quebra a conversa.
      expiraEm: new Date(Date.now() + (segundos > 0 ? segundos : 3600) * 1000),
    };
  }

  /**
   * Lê o `id_token` só para descobrir a conta — **sem validar assinatura**, e
   * isso é proposital: o token acabou de chegar por TLS do próprio emissor, e
   * nada de segurança depende deste valor. Ele vira o header
   * `ChatGPT-Account-ID`; se estiver errado, o backend recusa a chamada.
   */
  private claimsDoIdToken(idToken: string | undefined): {
    contaId: string | null;
    email: string | null;
  } {
    if (!idToken) return { contaId: null, email: null };
    try {
      const payload = idToken.split('.')[1];
      if (!payload) return { contaId: null, email: null };
      const json = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;

      const auth = json['https://api.openai.com/auth'] as
        Record<string, unknown> | undefined;
      const contaId = auth?.chatgpt_account_id;
      const email = json.email;

      return {
        contaId: typeof contaId === 'string' ? contaId : null,
        email: typeof email === 'string' ? email : null,
      };
    } catch {
      // id_token ilegível não impede o login — só deixa a tela sem o nome da
      // conta, e o header de conta vazio (que o backend vai recusar).
      return { contaId: null, email: null };
    }
  }

  /**
   * Lê o `refresh_token` do conteúdo do `auth.json`.
   *
   * Aceita o arquivo inteiro (`{ tokens: { refresh_token, ... } }`), o objeto
   * `tokens` sozinho, ou o token colado puro — as três formas em que as
   * pessoas efetivamente copiam isso.
   */
  private refreshDoAuthJson(conteudo: string): string {
    const texto = conteudo.trim();

    if (!texto.startsWith('{')) {
      if (/^[\w.~+/=-]+$/.test(texto)) return texto;
      throw new BadRequestException(
        'Não reconheci o conteúdo. Cole o arquivo auth.json inteiro do Codex CLI.',
      );
    }

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(texto) as Record<string, unknown>;
    } catch {
      throw new BadRequestException(
        'O conteúdo colado não é um JSON válido. Copie o arquivo auth.json inteiro.',
      );
    }

    const tokens = (json.tokens ?? json) as Record<string, unknown>;
    const refresh = tokens.refresh_token;
    if (typeof refresh !== 'string' || !refresh) {
      throw new BadRequestException(
        'Não encontrei o refresh_token no conteúdo colado. ' +
          'Rode `codex login` na sua máquina e copie o auth.json depois disso.',
      );
    }
    return refresh;
  }

  /** Aceita a URL inteira do callback ou só o `code`. */
  private extrair(retorno: string): { code: string; state: string | null } {
    const texto = retorno.trim();

    // A tela final do CLI (`/success?id_token=...`) não serve: nela o `code` já
    // foi consumido pelo próprio CLI. Quem cai aqui tem o Codex instalado, e o
    // caminho certo para essa pessoa é importar o auth.json.
    if (texto.includes('/success?') || texto.includes('id_token=')) {
      throw new BadRequestException(
        'Essa é a página final do Codex CLI, e nela o código de autorização já foi ' +
          'usado — ela não serve para conectar aqui. Como você já tem o CLI logado, ' +
          'use a opção "Importar do Codex CLI" e cole o conteúdo do arquivo ' +
          'auth.json (~/.codex/auth.json).',
      );
    }

    if (texto.includes('?') || texto.includes('code=')) {
      const consulta = texto.slice(texto.indexOf('?') + 1);
      const params = new URLSearchParams(consulta);

      const erro = params.get('error');
      if (erro) {
        const descricao = params.get('error_description') ?? erro;
        throw new BadRequestException(
          `A autorização foi negada pela OpenAI: ${descricao}`,
        );
      }

      const code = params.get('code');
      if (code) return { code, state: params.get('state') };
    }

    // Sem `?` e sem `code=`: é o código puro, colado sozinho.
    if (/^[\w.~-]+$/.test(texto)) return { code: texto, state: null };

    throw new BadRequestException(
      'Não encontrei o código de autorização no texto colado. ' +
        'Cole a URL inteira da barra de endereço depois de autorizar.',
    );
  }

  private acharPedido(
    empresaId: string,
    state: string | null,
  ): { chave: string; pedido: PedidoPendente } {
    if (state) {
      const pedido = this.pendentes.get(state);
      // O `state` amarra o retorno ao pedido: sem essa conferência, um code de
      // outra origem colado aqui seria aceito.
      if (!pedido || pedido.empresaId !== empresaId) {
        throw new BadRequestException(
          'Este pedido de conexão não é mais válido (expirou ou já foi usado). ' +
            'Clique em Conectar novamente.',
        );
      }
      return { chave: state, pedido };
    }

    // Code colado sozinho, sem state: só dá para casar se houver exatamente um
    // pedido aberto para esta empresa.
    const daEmpresa = [...this.pendentes.entries()].filter(
      ([, p]) => p.empresaId === empresaId,
    );
    if (daEmpresa.length !== 1) {
      throw new BadRequestException(
        daEmpresa.length === 0
          ? 'Nenhum pedido de conexão aberto. Clique em Conectar para começar.'
          : 'Há mais de um pedido de conexão aberto. Cole a URL inteira do ' +
              'callback, que identifica qual deles é.',
      );
    }
    const [chave, pedido] = daEmpresa[0];
    return { chave, pedido };
  }

  private limparVencidos(): void {
    const limite = Date.now() - VALIDADE_PEDIDO_MS;
    for (const [chave, pedido] of this.pendentes) {
      if (pedido.criadoEm < limite) this.pendentes.delete(chave);
    }
  }
}
