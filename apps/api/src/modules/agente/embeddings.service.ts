import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { decifrar } from './agente-cripto';

/**
 * Gera vetores de texto — a metade semântica da busca de produto.
 *
 * ## Por que é um serviço separado do chat
 *
 * Porque o provedor pode ser outro, e frequentemente é. O Codex por OAuth não
 * expõe endpoint de embeddings; a Anthropic não tem o serviço. E o modelo de
 * embedding se escolhe por dimensão e preço, não por qualidade de escrita —
 * são decisões independentes, e a configuração acompanha isso.
 *
 * ## O formato
 *
 * `POST {baseUrl}/embeddings` com `{ model, input }`, que é o formato da OpenAI
 * e o que praticamente todo mundo copia — Together, Voyage, Ollama, LM Studio.
 * Escolher esse formato é o que deixa a empresa trocar de provedor sem tocar
 * neste código.
 *
 * ## Sem configuração, não há erro
 *
 * `disponivel()` devolve false e quem chama segue sem vetor. É deliberado: a
 * busca lexical atende sozinha, e uma instalação que nunca configurou
 * embeddings não deve ver a busca de produto quebrar — deve vê-la um pouco pior.
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  /**
   * A dimensão que a coluna `vector(1536)` aceita.
   *
   * Vetor de outro tamanho é **recusado**, não truncado: comparar vetores de
   * modelos diferentes não dá erro, dá resultado sem sentido — e um resultado
   * sem sentido numa busca é muito mais difícil de perceber do que uma falha.
   */
  static readonly DIMENSOES = 1536;

  constructor(private readonly prisma: PrismaService) {}

  /** A configuração de embeddings da empresa, ou `null` se não há. */
  async config(empresaId: string) {
    const linha = await this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteConfig.findUnique({
        where: { empresaId },
        select: {
          embeddingBaseUrl: true,
          embeddingModelo: true,
          embeddingApiKeyCifrada: true,
        },
      }),
    );
    if (!linha?.embeddingBaseUrl || !linha.embeddingModelo) return null;

    return {
      baseUrl: linha.embeddingBaseUrl.replace(/\/+$/, ''),
      modelo: linha.embeddingModelo,
      // Chave vazia é caso legítimo: servidor local de embeddings não pede
      // autenticação nenhuma.
      apiKey: linha.embeddingApiKeyCifrada
        ? decifrar(linha.embeddingApiKeyCifrada)
        : null,
    };
  }

  async disponivel(empresaId: string) {
    return (await this.config(empresaId)) !== null;
  }

  /**
   * Vetores de vários textos numa chamada.
   *
   * Em lote porque indexar ficha é sempre em lote — uma ficha vira dezenas de
   * trechos, e uma chamada por trecho multiplicaria a latência por nada.
   */
  async gerar(empresaId: string, textos: string[]): Promise<number[][]> {
    if (textos.length === 0) return [];

    const cfg = await this.config(empresaId);
    if (!cfg) {
      throw new BadGatewayException(
        'O gerador de embeddings não está configurado. Informe-o em ' +
          'Administração > Agente IA.',
      );
    }

    const resposta = await fetch(`${cfg.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.modelo,
        input: textos,
        // Pedido explícito porque a OpenAI aceita reduzir a dimensão do
        // `text-embedding-3-*`. Provedor que não conhece o parâmetro o ignora,
        // e a conferência abaixo pega o caso em que ele devolveu outro tamanho.
        dimensions: EmbeddingsService.DIMENSOES,
      }),
    }).catch((erro: unknown) => {
      throw new BadGatewayException(
        `Não consegui falar com o gerador de embeddings: ${String(erro)}`,
      );
    });

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => '');
      throw new BadGatewayException(
        `O gerador de embeddings respondeu ${resposta.status}. ${corpo.slice(0, 200)}`,
      );
    }

    const json = (await resposta.json()) as {
      data?: { embedding?: number[]; index?: number }[];
    };
    const linhas = json.data ?? [];
    if (linhas.length !== textos.length) {
      throw new BadGatewayException(
        `Pedi ${textos.length} vetores e recebi ${linhas.length}.`,
      );
    }

    // A ordem não é garantida pelo formato — o `index` é que diz de qual texto
    // cada vetor é. Confiar na ordem daria, silenciosamente, o vetor de um
    // trecho colado no texto de outro.
    const vetores: number[][] = new Array<number[]>(textos.length);
    for (const [i, linha] of linhas.entries()) {
      const posicao = linha.index ?? i;
      const vetor = linha.embedding;
      if (!Array.isArray(vetor)) {
        throw new BadGatewayException('O provedor devolveu um vetor inválido.');
      }
      if (vetor.length !== EmbeddingsService.DIMENSOES) {
        throw new BadGatewayException(
          `O modelo devolveu vetores de ${vetor.length} dimensões e a base ` +
            `guarda ${EmbeddingsService.DIMENSOES}. Escolha um modelo dessa ` +
            'dimensão ou refaça a coluna e reindexe tudo.',
        );
      }
      vetores[posicao] = vetor;
    }

    return vetores;
  }

  /** Um texto só — o caso da pergunta que chega no WhatsApp. */
  async gerarUm(empresaId: string, texto: string): Promise<number[] | null> {
    if (!texto.trim()) return null;
    try {
      const [vetor] = await this.gerar(empresaId, [texto]);
      return vetor ?? null;
    } catch (erro) {
      // Numa **busca**, falha de embedding não pode derrubar a resposta ao
      // cliente: a parte lexical continua valendo, e o pior caso é um
      // resultado menos preciso. Na indexação é o contrário, e lá o erro sobe.
      this.logger.warn(
        `Busca sem vetor (embedding falhou): ${erro instanceof Error ? erro.message : String(erro)}`,
      );
      return null;
    }
  }
}
