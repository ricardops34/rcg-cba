import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  WhatsappEtiquetaCreate,
  WhatsappEtiquetaUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { WhatsappConversasService } from './whatsapp-conversas.service';

/** Quantas etiquetas cada usuário pode ter: o suficiente para organizar, sem virar bagunça. */
const MAX_ETIQUETAS_POR_USUARIO = 30;

const SELECT = { id: true, nome: true, cor: true } as const;

/**
 * Etiquetas pessoais de contato do WhatsApp.
 *
 * São **do usuário**: ele cria, aplica e filtra pelas dele. Nenhuma consulta
 * aqui devolve etiqueta de outra pessoa — a organização do atendimento é de
 * cada um. Quem pode etiquetar um contato é quem enxerga a conversa dele (o
 * escopo da conversa vale), e a etiqueta fica no **contato**, então a conversa
 * herda.
 */
@Injectable()
export class WhatsappEtiquetasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversas: WhatsappConversasService,
  ) {}

  listar(empresaId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappEtiqueta.findMany({
        where: { empresaId, usuarioId: user.id },
        orderBy: { nome: 'asc' },
        select: SELECT,
      }),
    );
  }

  async criar(
    empresaId: string,
    user: AuthenticatedUser,
    input: WhatsappEtiquetaCreate,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const total = await tx.whatsappEtiqueta.count({
        where: { empresaId, usuarioId: user.id },
      });
      if (total >= MAX_ETIQUETAS_POR_USUARIO) {
        throw new BadRequestException(
          `Você já tem ${MAX_ETIQUETAS_POR_USUARIO} etiquetas. Exclua alguma para criar outra.`,
        );
      }
      try {
        return await tx.whatsappEtiqueta.create({
          data: {
            empresaId,
            usuarioId: user.id,
            nome: input.nome,
            cor: input.cor,
          },
          select: SELECT,
        });
      } catch (erro) {
        throw this.traduzir(erro);
      }
    });
  }

  async atualizar(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    input: WhatsappEtiquetaUpdate,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      try {
        const { count } = await tx.whatsappEtiqueta.updateMany({
          where: { id, empresaId, usuarioId: user.id },
          data: input,
        });
        if (count === 0) throw new NotFoundException('Etiqueta não encontrada');
      } catch (erro) {
        throw this.traduzir(erro);
      }
      return tx.whatsappEtiqueta.findFirstOrThrow({
        where: { id },
        select: SELECT,
      });
    });
  }

  async excluir(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      // As ligações com os contatos saem junto (ON DELETE CASCADE).
      const { count } = await tx.whatsappEtiqueta.deleteMany({
        where: { id, empresaId, usuarioId: user.id },
      });
      if (count === 0) throw new NotFoundException('Etiqueta não encontrada');
      return { excluida: true };
    });
  }

  /**
   * Define as etiquetas **do usuário** no contato desta conversa, por inteiro:
   * as que ele tinha e não vieram saem, as novas entram. As etiquetas de outros
   * usuários no mesmo contato não são tocadas.
   */
  async definirDaConversa(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    etiquetaIds: string[],
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const conversa = await this.conversas.conversaNoEscopoPublica(
        tx,
        empresaId,
        user,
        conversaId,
      );
      const ids = [...new Set(etiquetaIds)];
      const minhas = ids.length
        ? await tx.whatsappEtiqueta.findMany({
            where: { id: { in: ids }, empresaId, usuarioId: user.id },
            select: { id: true },
          })
        : [];
      // Etiqueta de outro usuário (ou inexistente) é recusada, não ignorada.
      if (minhas.length !== ids.length) {
        throw new BadRequestException('Etiqueta inválida.');
      }

      await tx.whatsappContatoEtiqueta.deleteMany({
        where: {
          contatoId: conversa.contatoId,
          etiqueta: { usuarioId: user.id },
        },
      });
      if (ids.length) {
        await tx.whatsappContatoEtiqueta.createMany({
          data: ids.map((etiquetaId) => ({
            empresaId,
            contatoId: conversa.contatoId,
            etiquetaId,
          })),
        });
      }
      return tx.whatsappEtiqueta.findMany({
        where: { id: { in: ids } },
        orderBy: { nome: 'asc' },
        select: SELECT,
      });
    });
  }

  private traduzir(erro: unknown) {
    if (
      erro instanceof Prisma.PrismaClientKnownRequestError &&
      erro.code === 'P2002'
    ) {
      return new ConflictException('Você já tem uma etiqueta com esse nome.');
    }
    return erro;
  }
}
