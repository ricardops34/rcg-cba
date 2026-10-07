import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PaginationQuery } from '@plataforma/contracts';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';

const PRODUTO_SELECT = {
  chave: true,
  codigoErp: true,
  descricao: true,
  unidade: true,
} as const;

/**
 * Envio ao ERP dos equipamentos de comodato com produtos aplicáveis
 * incluídos, alterados ou removidos. A fila (`comodato_envios_erp`) é
 * alimentada por trigger no banco; aqui o ERP lê os pendentes e confirma.
 *
 * Cada item leva a **lista completa e atual** de aplicáveis do equipamento —
 * o ERP substitui a dele, e assim inclusão, alteração e remoção chegam do
 * mesmo jeito. Equipamento sem nenhum aplicável não sai (decisão do usuário,
 * 2026-10-07).
 */
@Injectable()
export class IntegracaoEquipamentosComodatoService {
  constructor(private readonly prisma: PrismaService) {}

  listarPendentes(empresaId: string, query: PaginationQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        situacao: 'pendente' as const,
        produto: {
          equipamentoComodato: { isNot: null },
          relacionados: { some: { tipo: 'aplicacao' as const } },
        },
      };
      const [itens, total] = await Promise.all([
        tx.comodatoEnvioErp.findMany({
          where,
          orderBy: { alteradoEm: 'asc' },
          ...paginationToSkipTake(query),
          include: {
            produto: {
              select: {
                ...PRODUTO_SELECT,
                equipamentoComodato: {
                  select: { ativo: true, observacao: true, deletedAt: true },
                },
                relacionados: {
                  where: { tipo: 'aplicacao' },
                  orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
                  select: {
                    observacao: true,
                    ordem: true,
                    relacionado: { select: PRODUTO_SELECT },
                  },
                },
              },
            },
          },
        }),
        tx.comodatoEnvioErp.count({ where }),
      ]);

      const data = itens.map((item) => {
        const p = item.produto;
        const eq = p.equipamentoComodato;
        return {
          id: item.id,
          // A versão: devolva-a no PATCH .../aplicada.
          alteradoEm: item.alteradoEm.toISOString(),
          equipamento: {
            produtoChave: p.chave,
            codigo: p.codigoErp,
            descricao: p.descricao,
            ativo: !!eq?.ativo && !eq.deletedAt,
            excluido: !!eq?.deletedAt,
            observacao: eq?.observacao ?? null,
          },
          aplicaveis: p.relacionados.map((r) => ({
            produtoChave: r.relacionado.chave,
            codigo: r.relacionado.codigoErp,
            descricao: r.relacionado.descricao,
            unidade: r.relacionado.unidade,
            observacao: r.observacao,
            ordem: r.ordem,
          })),
        };
      });
      return buildPaginatedResult(data, total, query);
    });
  }

  /**
   * O ERP gravou: o item sai da fila — desde que o equipamento não tenha
   * mudado depois da leitura. Se mudou, 409 e o item segue pendente com a
   * versão nova; o ERP lê de novo. Já confirmado também é 409, não 500: o ERP
   * reenvia a confirmação depois de uma queda de rede.
   */
  marcarAplicada(empresaId: string, id: string, alteradoEm: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const item = await tx.comodatoEnvioErp.findFirst({
        where: { id, empresaId },
        select: { situacao: true, alteradoEm: true },
      });
      if (!item)
        throw new NotFoundException('Equipamento não encontrado na fila');
      if (item.situacao === 'enviado') {
        throw new ConflictException('Equipamento já confirmado pelo ERP');
      }
      // A condição vai no próprio UPDATE: uma mudança que chegue entre a
      // leitura acima e a gravação não é engolida.
      const { count } = await tx.comodatoEnvioErp.updateMany({
        where: {
          id,
          empresaId,
          situacao: 'pendente',
          alteradoEm: new Date(alteradoEm),
        },
        data: { situacao: 'enviado', enviadoEm: new Date() },
      });
      if (count === 0) {
        throw new ConflictException(
          'O equipamento mudou depois da leitura — leia a fila de novo e reenvie.',
        );
      }
      return { id, situacao: 'enviado' as const };
    });
  }
}
