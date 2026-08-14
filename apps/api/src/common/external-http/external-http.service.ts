import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

/**
 * Cliente HTTP para as fontes públicas (IBGE, ViaCEP, MinhaReceita), sobre o
 * `fetch` nativo do Node — nenhuma delas exige credencial, então não há segredo
 * a carregar aqui.
 *
 * O ponto da camada é uniformizar a **falha**: dependência externa fora do ar
 * vira 502 (o problema não é do nosso servidor nem do cliente que chamou), e
 * registro inexistente vira 404. Sem isso, um timeout do IBGE apareceria como
 * 500 genérico e mandaria o suporte procurar bug do lado errado.
 */
@Injectable()
export class ExternalHttpService {
  private readonly logger = new Logger(ExternalHttpService.name);

  private get timeoutMs(): number {
    const bruto = Number(process.env.EXTERNAL_HTTP_TIMEOUT_MS);
    return Number.isFinite(bruto) && bruto > 0 ? bruto : 8000;
  }

  /**
   * GET que devolve JSON. `naoEncontrado` existe porque nem toda fonte usa 404
   * para "não achei": o ViaCEP responde 200 com `{ "erro": true }`.
   */
  async getJson<T>(
    url: string,
    opcoes: {
      fonte: string;
      naoEncontrado?: (status: number, corpo: unknown) => boolean;
      /**
       * Status HTTP que, nesta fonte, significam "não existe" em vez de
       * "estou com problema". Default `[404]`; a MinhaReceita, por exemplo,
       * responde 400 para CNPJ desconhecido — sem isso viraria um 502 que
       * culpa a fonte por um erro de digitação.
       */
      statusNaoEncontrado?: number[];
      /** Mensagem do 404, quando a fonte disser que não existe. */
      mensagemNaoEncontrado?: string;
    },
  ): Promise<T> {
    const {
      fonte,
      naoEncontrado,
      mensagemNaoEncontrado,
      statusNaoEncontrado = [404],
    } = opcoes;
    const inicio = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let resposta: Response;
    try {
      resposta = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          // Cortesia com serviços públicos: identificar quem está chamando.
          'User-Agent': 'plataforma-comercial/1.0 (+integracao-interna)',
        },
      });
    } catch (erro) {
      // A URL não entra no log: pode carregar CNPJ/CEP (dado pessoal).
      this.logger.warn(
        `${fonte}: falha de rede após ${Date.now() - inicio}ms — ${
          erro instanceof Error ? erro.message : 'erro desconhecido'
        }`,
      );
      throw new BadGatewayException(
        `Não foi possível consultar ${fonte} no momento. Tente novamente em instantes.`,
      );
    } finally {
      clearTimeout(timer);
    }

    const duracao = Date.now() - inicio;
    this.logger.log(`${fonte}: ${resposta.status} em ${duracao}ms`);

    if (statusNaoEncontrado.includes(resposta.status)) {
      throw new NotFoundException(
        mensagemNaoEncontrado ?? `Registro não encontrado em ${fonte}`,
      );
    }
    if (!resposta.ok) {
      throw new BadGatewayException(
        `${fonte} respondeu ${resposta.status}. Tente novamente em instantes.`,
      );
    }

    let corpo: unknown;
    try {
      corpo = await resposta.json();
    } catch {
      throw new BadGatewayException(`${fonte} devolveu uma resposta inválida`);
    }

    if (naoEncontrado?.(resposta.status, corpo)) {
      throw new NotFoundException(
        mensagemNaoEncontrado ?? `Registro não encontrado em ${fonte}`,
      );
    }

    return corpo as T;
  }
}

/** Base URLs por env, com o default público de cada fonte. */
export const BASE_URLS = {
  ibge: () => process.env.IBGE_BASE_URL ?? 'https://servicodados.ibge.gov.br',
  viacep: () => process.env.VIACEP_BASE_URL ?? 'https://viacep.com.br',
  minhaReceita: () =>
    process.env.MINHARECEITA_BASE_URL ?? 'https://minhareceita.org',
};
