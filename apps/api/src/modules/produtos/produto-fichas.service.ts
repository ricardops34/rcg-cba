import { copyFile, unlink } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import {
  FICHAS_DIR,
  extensaoPorMime,
  fichaPublicPath,
} from '../../common/uploads/uploads.config';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Fichas técnicas do produto: o PDF do fabricante e o Markdown extraído dele.
 *
 * Os dois existem porque têm leitores diferentes — o PDF é para o vendedor
 * abrir e mandar ao cliente, o Markdown é o que a IA lê. O modelo lê o PDF uma
 * vez, no anexo; daí em diante o que circula é o texto.
 */
@Injectable()
export class ProdutoFichasService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly SELECAO = {
    id: true,
    produtoId: true,
    titulo: true,
    markdown: true,
    arquivo: true,
    arquivoNome: true,
    mime: true,
    tamanho: true,
    visivelAgente: true,
    createdAt: true,
  };

  async listar(empresaId: string, produtoId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      this.listarTx(tx, empresaId, produtoId),
    );
  }

  /**
   * `apenasAgente` é o recorte que a ferramenta de produtos usa: ficha marcada
   * como não visível ao agente nem sai daqui. É código, não instrução de
   * prompt.
   */
  async listarTx(
    tx: TenantTx,
    empresaId: string,
    produtoId: string,
    opcoes: { apenasAgente?: boolean } = {},
  ) {
    const linhas = await tx.produtoFicha.findMany({
      where: {
        empresaId,
        produtoId,
        deletedAt: null,
        ...(opcoes.apenasAgente ? { visivelAgente: true } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: this.SELECAO,
    });
    return linhas.map(({ arquivo, ...f }) => ({
      ...f,
      url: fichaPublicPath(arquivo),
    }));
  }

  /**
   * Grava a ficha a partir de um arquivo que já está em disco.
   *
   * O arquivo é **copiado** para o diretório das fichas, e não movido: quem o
   * enviou foi o anexo do assistente, que tem ciclo de vida próprio (e pode
   * ser lido de novo se a gravação for refeita). Copiar custa um arquivo a
   * mais; mover deixaria o anexo apontando para o vazio.
   */
  async criar(
    empresaId: string,
    user: AuthenticatedUser,
    produtoId: string,
    origem: {
      caminho: string;
      nomeOriginal: string;
      mime: string;
      tamanho: number;
    },
    dados: { titulo: string; markdown: string },
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const produto = await tx.produto.findFirst({
        where: { id: produtoId, empresaId, deletedAt: null },
        select: { id: true },
      });
      if (!produto) throw new NotFoundException('Produto não encontrado');

      if (!existsSync(FICHAS_DIR)) mkdirSync(FICHAS_DIR, { recursive: true });
      const arquivo = `${randomUUID()}${extensaoPorMime(origem.mime)}`;
      await copyFile(origem.caminho, join(FICHAS_DIR, arquivo));

      return tx.produtoFicha.create({
        data: {
          empresaId,
          produtoId,
          arquivo,
          arquivoNome: origem.nomeOriginal.slice(0, 255),
          mime: origem.mime,
          tamanho: origem.tamanho,
          titulo: dados.titulo.slice(0, 200),
          markdown: dados.markdown,
          createdBy: user.id,
          updatedBy: user.id,
        },
        select: this.SELECAO,
      });
    });
  }

  /**
   * Editar o Markdown é o que mantém "a IA nunca passa preço" verificável: se
   * a ficha do fabricante trouxer tabela de preço, ela está aqui para ser
   * retirada antes de o texto chegar ao modelo.
   */
  async atualizar(
    empresaId: string,
    user: AuthenticatedUser,
    produtoId: string,
    id: string,
    input: { titulo?: string; markdown?: string; visivelAgente?: boolean },
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const ficha = await tx.produtoFicha.findFirst({
        where: { id, empresaId, produtoId, deletedAt: null },
        select: { id: true },
      });
      if (!ficha) throw new NotFoundException('Ficha não encontrada');

      return tx.produtoFicha.update({
        where: { id },
        data: {
          ...(input.titulo !== undefined ? { titulo: input.titulo } : {}),
          ...(input.markdown !== undefined ? { markdown: input.markdown } : {}),
          ...(input.visivelAgente !== undefined
            ? { visivelAgente: input.visivelAgente }
            : {}),
          updatedBy: user.id,
        },
        select: this.SELECAO,
      });
    });
  }

  /**
   * Exclusão lógica, e o PDF sai do disco junto.
   *
   * Manter o arquivo de uma ficha excluída só acumularia lixo que ninguém
   * consegue mais alcançar — não há tela que liste ficha excluída.
   */
  async remover(
    empresaId: string,
    user: AuthenticatedUser,
    produtoId: string,
    id: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const ficha = await tx.produtoFicha.findFirst({
        where: { id, empresaId, produtoId, deletedAt: null },
        select: { id: true, arquivo: true },
      });
      if (!ficha) throw new NotFoundException('Ficha não encontrada');

      await tx.produtoFicha.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id },
      });
      await unlink(join(FICHAS_DIR, ficha.arquivo)).catch(() => undefined);
      return { ok: true };
    });
  }
}
