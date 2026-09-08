import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type { FornecedorQuery } from '@plataforma/contracts';

const SORT_FIELDS = new Set([
  'razaoSocial',
  'nomeFantasia',
  'codigoErp',
  'municipio',
  'uf',
  'ativo',
  'createdAt',
]);

// Consulta read-only do cadastro espelhado do ERP. Sem escopo hierárquico, ao
// contrário de Clientes: fornecedor não tem carteira, e quem enxerga a tela já
// é recorte de perfil (só Administrador e Diretor — ver a migration
// `perm_compras`). O isolamento por empresa é da RLS, via `withTenant`.
@Injectable()
export class FornecedoresService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, query: FornecedorQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.uf ? { uf: query.uf } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  razaoSocial: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  nomeFantasia: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  cnpjCpf: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  codigoErp: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      };
      const sortField =
        query.sortBy && SORT_FIELDS.has(query.sortBy)
          ? query.sortBy
          : 'razaoSocial';
      const [data, total] = await Promise.all([
        tx.fornecedor.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.fornecedor.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  findOne(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const fornecedor = await tx.fornecedor.findFirst({
        where: { id, empresaId, deletedAt: null },
      });
      if (!fornecedor) throw new NotFoundException('Fornecedor não encontrado');
      return fornecedor;
    });
  }
}
