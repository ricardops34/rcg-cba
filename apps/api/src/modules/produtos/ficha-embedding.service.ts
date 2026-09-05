import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmbeddingsService } from '../agente/embeddings.service';
import { partirFicha } from './partir-ficha';
import { semPreco } from './sem-preco';

/**
 * Mantém os trechos vetorizados das fichas técnicas em dia.
 *
 * ## Quando roda
 *
 * Quando uma ficha nasce (importação em lote ou anexo pelo assistente) e quando
 * o Markdown dela é editado na tela. Reindexar é **apagar e refazer** os
 * trechos daquela ficha: guardar diferença entre versões de texto livre custaria
 * mais do que gerar de novo, e um trecho velho sobrevivendo à edição é
 * exatamente o que ninguém quer — o texto que a pessoa acabou de tirar
 * continuaria aparecendo na busca.
 *
 * ## O que é indexado
 *
 * O Markdown **depois** do `semPreco`. O que não pode chegar ao cliente também
 * não deve virar vetor: um trecho de tabela de preço indexado seria encontrado
 * por uma pergunta sobre preço e entregue ao modelo, contornando a regra por
 * outro caminho.
 *
 * ## Sem provedor configurado
 *
 * Os trechos são gravados **sem** vetor. A busca lexical continua encontrando o
 * produto, e no dia em que a empresa configurar embeddings a varredura preenche
 * o que faltava — sem reprocessar PDF, porque o texto já está aqui.
 */
@Injectable()
export class FichaEmbeddingService {
  private readonly logger = new Logger(FichaEmbeddingService.name);

  /**
   * Quantos textos por chamada ao provedor.
   *
   * Lote grande economiza latência, mas estoura o limite de tokens por
   * requisição de alguns provedores. 32 trechos de ~800 caracteres são ~8 mil
   * tokens, que passa folgado em qualquer um.
   */
  private static readonly LOTE = 32;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  /**
   * Refaz os trechos de uma ficha.
   *
   * Nunca lança: é chamada de dentro da gravação da ficha, e uma falha de
   * provedor não pode desfazer o anexo de um PDF que já está no produto. O
   * que fica sem vetor a varredura pega depois.
   */
  async indexar(
    empresaId: string,
    ficha: { id: string; produtoId: string; titulo: string; markdown: string },
  ): Promise<void> {
    try {
      const trechos = partirFicha(semPreco(ficha.markdown), ficha.titulo);

      await this.prisma.withTenant(empresaId, async (tx) => {
        await tx.produtoFichaTrecho.deleteMany({
          where: { empresaId, fichaId: ficha.id },
        });
        if (trechos.length === 0) return;
        await tx.produtoFichaTrecho.createMany({
          data: trechos.map((texto, ordem) => ({
            empresaId,
            fichaId: ficha.id,
            produtoId: ficha.produtoId,
            ordem,
            texto,
          })),
        });
      });

      await this.vetorizarPendentes(empresaId, ficha.id);
    } catch (erro) {
      this.logger.warn(
        `Ficha ${ficha.id} ficou sem índice semântico: ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
      );
    }
  }

  /**
   * Gera os vetores dos trechos que ainda não têm.
   *
   * Sem `fichaId` varre a empresa inteira — é o caminho de quem configurou
   * embeddings depois de já ter fichas cadastradas, e o de quem quer completar
   * o que falhou.
   */
  async vetorizarPendentes(
    empresaId: string,
    fichaId?: string,
    teto = 200,
  ): Promise<{ vetorizados: number }> {
    if (!(await this.embeddings.disponivel(empresaId))) {
      return { vetorizados: 0 };
    }

    const cfg = await this.embeddings.config(empresaId);
    let total = 0;

    while (total < teto) {
      // `embedding IS NULL` precisa de SQL cru: o Prisma não conhece a coluna
      // (ela é `Unsupported`) e não a expõe no `where`.
      const pendentes = await this.prisma.withTenant(
        empresaId,
        (tx) =>
          tx.$queryRaw<{ id: string; texto: string }[]>`
          SELECT "id", "texto"
          FROM "produto_ficha_trechos"
          WHERE "empresaId" = ${empresaId}
            AND "embedding" IS NULL
            ${fichaId ? Prisma.sql`AND "fichaId" = ${fichaId}` : Prisma.empty}
          ORDER BY "fichaId", "ordem"
          LIMIT ${FichaEmbeddingService.LOTE}
        `,
      );
      if (pendentes.length === 0) break;

      const vetores = await this.embeddings.gerar(
        empresaId,
        pendentes.map((p) => p.texto),
      );

      await this.prisma.withTenant(empresaId, async (tx) => {
        for (const [i, trecho] of pendentes.entries()) {
          // O literal de vetor do pgvector é '[1,2,3]'. Vai como texto e é
          // convertido no banco — o driver não tem tipo para isso.
          const literal = `[${vetores[i].join(',')}]`;
          await tx.$executeRaw`
            UPDATE "produto_ficha_trechos"
            SET "embedding" = ${literal}::vector, "modelo" = ${cfg?.modelo ?? null}
            WHERE "id" = ${trecho.id} AND "empresaId" = ${empresaId}
          `;
        }
      });

      total += pendentes.length;
      if (pendentes.length < FichaEmbeddingService.LOTE) break;
    }

    if (total > 0) {
      this.logger.log(`${total} trecho(s) de ficha vetorizados.`);
    }
    return { vetorizados: total };
  }

  /** Tira os trechos de uma ficha excluída. */
  async remover(empresaId: string, fichaId: string): Promise<void> {
    await this.prisma.withTenant(empresaId, (tx) =>
      tx.produtoFichaTrecho.deleteMany({ where: { empresaId, fichaId } }),
    );
  }
}
