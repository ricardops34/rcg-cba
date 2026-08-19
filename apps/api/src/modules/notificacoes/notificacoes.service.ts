import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { NotificacoesFeed } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/** Quantas linhas o sino mostra. O contador do badge conta todas. */
const LIMITE_ITENS = 20;

@Injectable()
export class NotificacoesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Feed do sino: as não lidas do usuário logado.
   *
   * Uma consulta só, porque a tabela é a fonte única — quem provoca o fato já
   * gravou a linha (ver `registrarNotificacao`). Não há filtro por permissão
   * aqui: a notificação foi endereçada a este usuário na origem, onde o escopo
   * era conhecido. Filtrar de novo na leitura só esconderia o que já foi
   * decidido, e mal: a permissão pode ter mudado depois do fato.
   */
  async feed(
    empresaId: string,
    user: AuthenticatedUser,
  ): Promise<NotificacoesFeed> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = { usuarioId: user.id, lidaEm: null };
      const [total, linhas] = await Promise.all([
        tx.notificacao.count({ where }),
        tx.notificacao.findMany({
          where,
          orderBy: { ocorridaEm: 'desc' },
          take: LIMITE_ITENS,
        }),
      ]);

      return {
        total,
        itens: linhas.map((l) => ({
          id: l.id,
          tipo: l.tipo,
          titulo: l.titulo,
          descricao: l.descricao,
          data: l.ocorridaEm.toISOString(),
          rota: l.rota,
          contador: l.contador,
        })),
      };
    });
  }

  /**
   * Marca uma notificação como lida.
   *
   * `updateMany` com o `usuarioId` no filtro, e não `update` por id: assim
   * ninguém marca a notificação de outra pessoa, e a checagem é a própria
   * gravação — sem uma leitura antes que outra requisição pudesse invalidar.
   */
  async marcarLida(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const { count } = await tx.notificacao.updateMany({
        where: { id, usuarioId: user.id, lidaEm: null },
        data: { lidaEm: new Date() },
      });
      // Já lida conta como sucesso: o clique repetido não é erro. Só o id que
      // não é do usuário (ou não existe) sai como 404.
      if (count === 0) {
        const existe = await tx.notificacao.count({
          where: { id, usuarioId: user.id },
        });
        if (existe === 0)
          throw new NotFoundException('Notificação não encontrada');
      }
      return { lida: true };
    });
  }

  /** Limpa o sino de uma vez. */
  async marcarTodasLidas(empresaId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const { count } = await tx.notificacao.updateMany({
        where: { usuarioId: user.id, lidaEm: null },
        data: { lidaEm: new Date() },
      });
      return { marcadas: count };
    });
  }
}
