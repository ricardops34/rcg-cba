import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, Prisma } from '../../common/prisma/prisma.service';
import {
  combinarFiltroVendedor,
  resolverEscopoVendedores,
} from '../../common/escopo/escopo-vendedores';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type { TituloReceberQuery } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  calcularStatusTituloReceber,
  inicioDoDia,
} from './titulo-receber-status';

const SORT_FIELDS = new Set(['numero', 'emissao', 'vencimento', 'valor', 'saldo', 'dtBaixa', 'createdAt']);

const CLIENTE_SELECT = {
  select: { id: true, codigoErp: true, razaoSocial: true, nomeFantasia: true },
};
const VENDEDOR_SELECT = { select: { id: true, nome: true, nomeReduzido: true } };

// Consulta read-only com o mesmo escopo hierárquico de Clientes.
@Injectable()
export class TitulosReceberService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, user: AuthenticatedUser, query: TituloReceberQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      // Mesmo corte usado por calcularStatusTituloReceber — se o filtro do
      // banco e o cálculo do badge divergirem, a lista mostra "aberto" numa
      // busca por "vencido".
      const hoje = inicioDoDia();
      const condicoesStatus: Prisma.TituloReceberWhereInput[] = [];
      if (query.status === 'baixado') {
        condicoesStatus.push({ dtBaixa: { not: null } });
      } else if (query.status === 'aberto') {
        condicoesStatus.push(
          { dtBaixa: null },
          { OR: [{ vencimento: null }, { vencimento: { gte: hoje } }] },
        );
      } else if (query.status === 'vencido') {
        condicoesStatus.push({ dtBaixa: null }, { vencimento: { lt: hoje } });
      }
      const where = {
        empresaId,
        deletedAt: null,
        ...combinarFiltroVendedor(escopo, query.vendedorId),
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.clienteId ? { clienteId: query.clienteId } : {}),
        ...(condicoesStatus.length ? { AND: condicoesStatus } : {}),
        ...(query.search
          ? {
              OR: [
                { numero: { contains: query.search, mode: 'insensitive' as const } },
                {
                  cliente: {
                    razaoSocial: { contains: query.search, mode: 'insensitive' as const },
                  },
                },
              ],
            }
          : {}),
      };
      const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'vencimento';
      const sortOrder = query.sortBy ? query.sortOrder : 'desc';
      const [data, total] = await Promise.all([
        tx.tituloReceber.findMany({
          where,
          include: { cliente: CLIENTE_SELECT, vendedor: VENDEDOR_SELECT },
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: sortOrder },
        }),
        tx.tituloReceber.count({ where }),
      ]);
      const comStatus = data.map((titulo) => ({
        ...titulo,
        status: calcularStatusTituloReceber(titulo, hoje),
      }));
      return buildPaginatedResult(comStatus, total, query);
    });
  }

  async findOne(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const titulo = await tx.tituloReceber.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
        include: { cliente: CLIENTE_SELECT, vendedor: VENDEDOR_SELECT },
      });
      if (!titulo) throw new NotFoundException('Título não encontrado');
      return {
        ...titulo,
        status: calcularStatusTituloReceber(titulo, inicioDoDia()),
      };
    });
  }
}
