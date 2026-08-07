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
import type { NotaSaidaQuery } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const SORT_FIELDS = new Set(['numero', 'dtEmissao', 'vlrItens', 'vlrBruto', 'ativo', 'createdAt']);

const CLIENTE_SELECT = {
  select: { id: true, codigoErp: true, razaoSocial: true, nomeFantasia: true },
};
const VENDEDOR_SELECT = { select: { id: true, nome: true, nomeReduzido: true } };
const CONDICAO_SELECT = { select: { id: true, codigoErp: true, descricao: true } };

// Consulta read-only com o mesmo escopo hierárquico de Clientes: usuário
// restrito só enxerga notas da própria carteira/time.
//
// notaSaida.vendedorId é quem efetivamente fez aquela venda (exibido na
// tela) — mas escopo/filtro de "quem pode ver esta nota" considera o
// vendedor do CADASTRO DO CLIENTE (cliente.vendedorId), não o da nota: uma
// nota registrada por outro vendedor (cobrindo, por exemplo) continua
// visível pra quem enxerga aquele cliente.
@Injectable()
export class NotasSaidaService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, user: AuthenticatedUser, query: NotaSaidaQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const where = {
        empresaId,
        deletedAt: null,
        cliente: combinarFiltroVendedor(escopo, query.vendedorId),
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.clienteId ? { clienteId: query.clienteId } : {}),
        ...(query.comodato !== undefined ? { comodato: query.comodato } : {}),
        ...(query.tipo ? { tipo: query.tipo } : {}),
        ...(query.ano !== undefined ? { ano: query.ano } : {}),
        ...(query.mes !== undefined ? { mes: query.mes } : {}),
        ...(query.search
          ? {
              OR: [
                { numero: { contains: query.search, mode: 'insensitive' as const } },
                { chaveNfe: { contains: query.search, mode: 'insensitive' as const } },
                {
                  cliente: {
                    razaoSocial: { contains: query.search, mode: 'insensitive' as const },
                  },
                },
              ],
            }
          : {}),
      };
      const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'dtEmissao';
      const sortOrder = query.sortBy ? query.sortOrder : 'desc';
      const [data, total] = await Promise.all([
        tx.notaSaida.findMany({
          where,
          include: {
            cliente: CLIENTE_SELECT,
            vendedor: VENDEDOR_SELECT,
          },
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: sortOrder },
        }),
        tx.notaSaida.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const nota = await tx.notaSaida.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { cliente: { vendedorId: { in: escopo } } } : {}),
        },
        include: {
          cliente: CLIENTE_SELECT,
          vendedor: VENDEDOR_SELECT,
          condicaoPagamento: CONDICAO_SELECT,
          itens: {
            where: { deletedAt: null },
            orderBy: { item: 'asc' },
            include: {
              produto: { select: { id: true, codigoErp: true, descricao: true, unidade: true } },
              regraDesconto: { select: { id: true, codigoErp: true, descricao: true } },
            },
          },
        },
      });
      if (!nota) throw new NotFoundException('Nota de saída não encontrada');
      return nota;
    });
  }
}
