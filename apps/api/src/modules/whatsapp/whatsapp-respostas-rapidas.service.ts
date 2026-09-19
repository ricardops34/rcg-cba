import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export type RespostaRapidaCriarInput = {
  atalho: string;
  titulo: string;
  conteudo: string;
};

export type RespostaRapidaEditarInput = Partial<RespostaRapidaCriarInput>;

@Injectable()
export class WhatsappRespostasRapidasService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista todas as respostas rápidas / atalhos da empresa. */
  async listar(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappRespostaRapida.findMany({
        where: { empresaId },
        orderBy: { atalho: 'asc' },
      }),
    );
  }

  /** Normaliza o atalho (remove '/' inicial e espaços, converte pra minúsculo). */
  private normalizarAtalho(atalho: string): string {
    const limpo = atalho.trim().replace(/^\/+/, '').toLowerCase();
    if (!limpo) {
      throw new BadRequestException('O atalho não pode ser vazio.');
    }
    if (!/^[a-z0-9_-]+$/.test(limpo)) {
      throw new BadRequestException(
        'O atalho deve conter apenas letras, números, hífen ou underline (ex: pix, catalogo, horario).',
      );
    }
    return limpo;
  }

  /** Cria um novo atalho de resposta rápida. */
  async criar(empresaId: string, usuarioId: string, input: RespostaRapidaCriarInput) {
    const atalho = this.normalizarAtalho(input.atalho);

    if (!input.titulo?.trim()) {
      throw new BadRequestException('O título da resposta rápida é obrigatório.');
    }
    if (!input.conteudo?.trim()) {
      throw new BadRequestException('O conteúdo da resposta rápida é obrigatório.');
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.whatsappRespostaRapida.findUnique({
        where: {
          empresaId_atalho: { empresaId, atalho },
        },
      });

      if (existente) {
        throw new BadRequestException(`Já existe uma resposta rápida com o atalho /${atalho}.`);
      }

      return tx.whatsappRespostaRapida.create({
        data: {
          empresaId,
          atalho,
          titulo: input.titulo.trim(),
          conteudo: input.conteudo.trim(),
          criadoPor: usuarioId,
        },
      });
    });
  }

  /** Atualiza uma resposta rápida existente. */
  async atualizar(
    empresaId: string,
    id: string,
    input: RespostaRapidaEditarInput,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.whatsappRespostaRapida.findFirst({
        where: { id, empresaId },
      });

      if (!existente) {
        throw new NotFoundException('Resposta rápida não encontrada.');
      }

      const atalho = input.atalho !== undefined ? this.normalizarAtalho(input.atalho) : existente.atalho;

      if (input.atalho !== undefined && atalho !== existente.atalho) {
        const duplicado = await tx.whatsappRespostaRapida.findUnique({
          where: { empresaId_atalho: { empresaId, atalho } },
        });
        if (duplicado) {
          throw new BadRequestException(`Já existe uma resposta rápida com o atalho /${atalho}.`);
        }
      }

      return tx.whatsappRespostaRapida.update({
        where: { id },
        data: {
          ...(input.atalho !== undefined ? { atalho } : {}),
          ...(input.titulo !== undefined ? { titulo: input.titulo.trim() } : {}),
          ...(input.conteudo !== undefined ? { conteudo: input.conteudo.trim() } : {}),
        },
      });
    });
  }

  /** Exclui uma resposta rápida. */
  async excluir(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.whatsappRespostaRapida.findFirst({
        where: { id, empresaId },
      });

      if (!existente) {
        throw new NotFoundException('Resposta rápida não encontrada.');
      }

      await tx.whatsappRespostaRapida.delete({
        where: { id },
      });

      return { ok: true };
    });
  }
}
