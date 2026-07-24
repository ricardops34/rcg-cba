import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  combinarFiltroVendedor,
  resolverEscopoVendedores,
} from '../../common/escopo/escopo-vendedores';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type { NotaSaidaItemQuery } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const SORT_FIELDS = new Set(['dtEmissao', 'quantidade', 'vlrUnitario', 'vlrTotal', 'createdAt']);

const PRODUTO_SELECT = { select: { id: true, codigoErp: true, descricao: true, unidade: true } };
const CLIENTE_SELECT = { select: { id: true, razaoSocial: true, nomeFantasia: true } };
const VENDEDOR_SELECT = { select: { id: true, nome: true, nomeReduzido: true } };
const NOTA_SELECT = { select: { id: true, numero: true, serie: true } };

// Consulta read-only com o mesmo escopo hierárquico de Clientes.
@Injectable()
export class ItensNotaSaidaService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, user: AuthenticatedUser, query: NotaSaidaItemQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const where = {
        empresaId,
        deletedAt: null,
        ...combinarFiltroVendedor(escopo, query.vendedorId),
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.notaSaidaId ? { notaSaidaId: query.notaSaidaId } : {}),
        ...(query.clienteId ? { clienteId: query.clienteId } : {}),
        ...(query.produtoId ? { produtoId: query.produtoId } : {}),
        ...(query.comodato !== undefined ? { comodato: query.comodato } : {}),
        ...(query.ano !== undefined ? { ano: query.ano } : {}),
        ...(query.mes !== undefined ? { mes: query.mes } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  produto: {
                    descricao: { contains: query.search, mode: 'insensitive' as const },
                  },
                },
                {
                  produto: {
                    codigoErp: { contains: query.search, mode: 'insensitive' as const },
                  },
                },
                { notaSaida: { numero: { contains: query.search, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      };
      const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'dtEmissao';
      const sortOrder = query.sortBy ? query.sortOrder : 'desc';
      const [data, total] = await Promise.all([
        tx.notaSaidaItem.findMany({
          where,
          include: {
            produto: PRODUTO_SELECT,
            cliente: CLIENTE_SELECT,
            vendedor: VENDEDOR_SELECT,
            notaSaida: NOTA_SELECT,
          },
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: sortOrder },
        }),
        tx.notaSaidaItem.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const item = await tx.notaSaidaItem.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
        include: {
          produto: PRODUTO_SELECT,
          cliente: CLIENTE_SELECT,
          vendedor: VENDEDOR_SELECT,
          notaSaida: NOTA_SELECT,
        },
      });
      if (!item) throw new NotFoundException('Item de nota não encontrado');
      return item;
    });
  }
}
