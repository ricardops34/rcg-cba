import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type { NotaEntradaQuery } from '@plataforma/contracts';

const SORT_FIELDS = new Set([
  'numero',
  'dtEmissao',
  'dtEntrada',
  'vlrItens',
  'vlrBruto',
  'ativo',
  'createdAt',
]);

const FORNECEDOR_SELECT = {
  select: { id: true, codigoErp: true, razaoSocial: true, nomeFantasia: true },
};
const CLIENTE_SELECT = {
  select: { id: true, codigoErp: true, razaoSocial: true, nomeFantasia: true },
};
const CONDICAO_SELECT = {
  select: { id: true, codigoErp: true, descricao: true },
};

// Consulta read-only das notas de compra, espelho do ERP. Sem escopo
// hierárquico de vendedor — compra não tem carteira; quem enxerga a tela já é
// recorte de perfil (Administrador e Diretor, pela migration `perm_compras`),
// justamente porque a nota carrega o custo. O corte por empresa é da RLS, via
// `withTenant`.
@Injectable()
export class NotasEntradaService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, query: NotaEntradaQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.fornecedorId ? { fornecedorId: query.fornecedorId } : {}),
        ...(query.clienteId ? { clienteId: query.clienteId } : {}),
        ...(query.tipo ? { tipo: query.tipo } : {}),
        ...(query.ano !== undefined ? { ano: query.ano } : {}),
        ...(query.mes !== undefined ? { mes: query.mes } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  numero: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  chaveNfe: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  fornecedor: {
                    razaoSocial: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                },
                {
                  cliente: {
                    razaoSocial: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                },
              ],
            }
          : {}),
      };
      const sortField =
        query.sortBy && SORT_FIELDS.has(query.sortBy)
          ? query.sortBy
          : 'dtEmissao';
      const sortOrder = query.sortBy ? query.sortOrder : 'desc';
      const [data, total] = await Promise.all([
        tx.notaEntrada.findMany({
          where,
          include: { fornecedor: FORNECEDOR_SELECT, cliente: CLIENTE_SELECT },
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: sortOrder },
        }),
        tx.notaEntrada.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  findOne(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const nota = await tx.notaEntrada.findFirst({
        where: { id, empresaId, deletedAt: null },
        include: {
          fornecedor: FORNECEDOR_SELECT,
          cliente: CLIENTE_SELECT,
          condicaoPagamento: CONDICAO_SELECT,
          itens: {
            where: { deletedAt: null },
            orderBy: { item: 'asc' },
            include: {
              produto: {
                select: {
                  id: true,
                  codigoErp: true,
                  descricao: true,
                  unidade: true,
                },
              },
              armazem: {
                select: { id: true, codigoErp: true, descricao: true },
              },
            },
          },
        },
      });
      if (!nota) throw new NotFoundException('Nota de entrada não encontrada');
      return nota;
    });
  }
}
