import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AGENTE_DIR } from '../../common/uploads/uploads.config';
import type { AnexoChat } from './provedor-ia';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Arquivos que alguém anexa a uma mensagem do assistente interno.
 *
 * O anexo é **material de passagem**: ele existe para o modelo ler uma vez (a
 * ficha técnica em PDF, a foto do produto) e para a ferramenta gravar o que
 * saiu daí. O que fica guardado de verdade é a cópia no destino — a ficha ou a
 * foto do produto.
 *
 * Três travas, e nenhuma delas é prompt:
 *
 * 1. o `withTenant` prende o anexo à empresa;
 * 2. o `usuarioId` impede que a conversa de uma pessoa use o arquivo de outra;
 * 3. o `consumidoEm` impede reaproveitar o mesmo upload em duas gravações.
 *
 * E o **modelo nunca escolhe o anexo**: ele chega ao provedor porque a mensagem
 * o carrega, e à ferramenta porque o servidor o injeta nos argumentos. Se o id
 * fosse um parâmetro declarado, bastaria convencer o modelo a informar outro.
 */
@Injectable()
export class AgenteAnexosService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(
    empresaId: string,
    user: AuthenticatedUser,
    arquivo: Express.Multer.File,
  ) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteAnexo.create({
        data: {
          empresaId,
          usuarioId: user.id,
          arquivo: arquivo.filename,
          // O nome enviado nunca toca o disco (ver `extensaoPorMime`); aqui
          // ele é só o rótulo que o modelo e a tela mostram.
          arquivoNome: arquivo.originalname.slice(0, 255),
          mime: arquivo.mimetype,
          tamanho: arquivo.size,
        },
        select: {
          id: true,
          arquivoNome: true,
          mime: true,
          tamanho: true,
          createdAt: true,
        },
      }),
    );
  }

  /** O anexo de quem está falando, ou erro. Nunca o de outra pessoa. */
  async meu(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const anexo = await tx.agenteAnexo.findFirst({
        where: { id, empresaId, usuarioId: user.id },
      });
      if (!anexo) throw new NotFoundException('Anexo não encontrado');
      return anexo;
    });
  }

  /**
   * O anexo no formato que o provedor lê.
   *
   * Base64 na memória mesmo: o teto do upload é 10 MB, e o arquivo já vai
   * inteiro no corpo da requisição ao provedor — não há o que economizar
   * transmitindo em pedaços.
   */
  async paraProvedor(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
  ): Promise<AnexoChat> {
    const anexo = await this.meu(empresaId, user, id);
    const conteudo = await readFile(join(AGENTE_DIR, anexo.arquivo));
    return {
      nome: anexo.arquivoNome,
      mime: anexo.mime,
      base64: conteudo.toString('base64'),
    };
  }

  /**
   * Onde o arquivo está e o que ele é — para a ferramenta copiá-lo ao destino.
   *
   * Marca `consumidoEm` na mesma transação: sem isso, confirmar duas vezes a
   * mesma pendência anexaria o PDF duas vezes ao produto.
   */
  async consumir(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    tipoEsperado: 'pdf' | 'imagem',
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const anexo = await tx.agenteAnexo.findFirst({
        where: { id, empresaId, usuarioId: user.id },
      });
      if (!anexo) throw new NotFoundException('Anexo não encontrado');
      if (anexo.consumidoEm) {
        throw new BadRequestException(
          'Este arquivo já foi anexado. Envie o arquivo de novo se quiser repetir.',
        );
      }

      const ehPdf = anexo.mime === 'application/pdf';
      if (tipoEsperado === 'pdf' && !ehPdf) {
        throw new BadRequestException('A ficha técnica precisa ser um PDF');
      }
      if (tipoEsperado === 'imagem' && ehPdf) {
        throw new BadRequestException(
          'A foto do produto precisa ser uma imagem',
        );
      }

      await tx.agenteAnexo.update({
        where: { id },
        data: { consumidoEm: new Date() },
      });

      return {
        caminho: join(AGENTE_DIR, anexo.arquivo),
        arquivo: anexo.arquivo,
        nomeOriginal: anexo.arquivoNome,
        mime: anexo.mime,
        tamanho: anexo.tamanho,
      };
    });
  }

  /** Desfaz o consumo quando a gravação falhou depois de marcá-lo. */
  async devolver(empresaId: string, id: string) {
    await this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteAnexo.updateMany({
        where: { id, empresaId },
        data: { consumidoEm: null },
      }),
    );
  }

  /** Remove o arquivo de passagem do disco, sem derrubar nada se ele já sumiu. */
  async apagarArquivo(arquivo: string) {
    await unlink(join(AGENTE_DIR, arquivo)).catch(() => undefined);
  }
}
