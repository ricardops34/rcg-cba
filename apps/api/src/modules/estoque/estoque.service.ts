import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type { EstoqueQuery } from '@plataforma/contracts';

const SORT_FIELDS = new Set(['saldo', 'reserva', 'custo', 'ultimoPreco', 'ultimaCompra', 'createdAt']);

const PRODUTO_SELECT = { select: { id: true, codigoErp: true, descricao: true, unidade: true } };
const ARMAZEM_SELECT = { select: { id: true, codigoErp: true, descricao: true } };

// Consulta read-only: o saldo entra só pelo import do legado (e no futuro
// pela API externa de manutenção) — nada de create/update/delete manual.
@Injectable()
export class EstoqueService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, query: EstoqueQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.armazemId ? { armazemId: query.armazemId } : {}),
        ...(query.comSaldo !== undefined
          ? query.comSaldo
            ? { saldo: { gt: 0 } }
            : { saldo: { lte: 0 } }
          : {}),
        ...(query.search
          ? {
              produto: {
                OR: [
                  { descricao: { contains: query.search, mode: 'insensitive' as const } },
                  { codigoErp: { contains: query.search, mode: 'insensitive' as const } },
                ],
              },
            }
          : {}),
      };
      const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : undefined;
      const [data, total] = await Promise.all([
        tx.estoque.findMany({
          where,
          include: { produto: PRODUTO_SELECT, armazem: ARMAZEM_SELECT },
          ...paginationToSkipTake(query),
          // Sem sortBy explícito ordena pela descrição do produto.
          orderBy: sortField
            ? { [sortField]: query.sortOrder }
            : { produto: { descricao: query.sortOrder } },
        }),
        tx.estoque.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const estoque = await tx.estoque.findFirst({
        where: { id, empresaId, deletedAt: null },
        include: { produto: PRODUTO_SELECT, armazem: ARMAZEM_SELECT },
      });
      if (!estoque) throw new NotFoundException('Registro de estoque não encontrado');
      return estoque;
    });
  }
}
