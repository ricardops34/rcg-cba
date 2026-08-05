import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, Prisma } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type {
  IntegracaoEstoque,
  IntegracaoEstoqueCreate,
  IntegracaoEstoqueQuery,
  IntegracaoEstoqueUpdate,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';

const INCLUDE = {
  produto: { select: { codigoErp: true } },
  armazem: { select: { codigoErp: true } },
} satisfies Prisma.EstoqueInclude;
type EstoqueComRelacoes = Prisma.EstoqueGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class IntegracaoEstoqueService {
  constructor(private readonly prisma: PrismaService) {}

  private paraLeitura(row: EstoqueComRelacoes): IntegracaoEstoque {
    return {
      id: row.id,
      produtoCodigo: row.produto.codigoErp,
      armazemCodigo: row.armazem.codigoErp,
      saldo: row.saldo,
      reserva: row.reserva,
      custo: row.custo,
      ultimoPreco: row.ultimoPreco,
      ultimaCompra: row.ultimaCompra,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  findAll(empresaId: string, query: IntegracaoEstoqueQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.produtoCodigo
          ? { produto: { codigoErp: query.produtoCodigo } }
          : {}),
        ...(query.armazemCodigo
          ? { armazem: { codigoErp: query.armazemCodigo } }
          : {}),
      };
      const [data, total] = await Promise.all([
        tx.estoque.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
        }),
        tx.estoque.count({ where }),
      ]);
      return buildPaginatedResult(
        data.map((r) => this.paraLeitura(r)),
        total,
        query,
      );
    });
  }

  async findOne(
    empresaId: string,
    produtoCodigo: string,
    armazemCodigo: string,
  ): Promise<IntegracaoEstoque> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.estoque.findFirst({
        where: {
          empresaId,
          deletedAt: null,
          produto: { codigoErp: produtoCodigo },
          armazem: { codigoErp: armazemCodigo },
        },
        include: INCLUDE,
      });
      if (!row) throw new NotFoundException('Saldo de estoque não encontrado');
      return this.paraLeitura(row);
    });
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoEstoqueCreate,
  ): Promise<IntegracaoEstoque> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const produto = await tx.produto.findFirst({
        where: { empresaId, codigoErp: input.produtoCodigo, deletedAt: null },
        select: { id: true },
      });
      if (!produto)
        throw new NotFoundException(
          `produtoCodigo '${input.produtoCodigo}' não encontrado`,
        );
      const armazem = await tx.armazem.findFirst({
        where: { empresaId, codigoErp: input.armazemCodigo, deletedAt: null },
        select: { id: true },
      });
      if (!armazem)
        throw new NotFoundException(
          `armazemCodigo '${input.armazemCodigo}' não encontrado`,
        );

      const existente = await tx.estoque.findFirst({
        where: { empresaId, produtoId: produto.id, armazemId: armazem.id },
      });
      if (existente) {
        throw new ConflictException(
          `Já existe saldo de estoque para produtoCodigo '${input.produtoCodigo}' + armazemCodigo '${input.armazemCodigo}'`,
        );
      }

      const criado = await tx.estoque.create({
        data: {
          empresaId,
          produtoId: produto.id,
          armazemId: armazem.id,
          saldo: input.saldo,
          reserva: input.reserva ?? null,
          custo: input.custo ?? null,
          ultimoPreco: input.ultimoPreco ?? null,
          ultimaCompra: input.ultimaCompra ?? null,
          createdBy: autor,
          updatedBy: autor,
        },
        include: INCLUDE,
      });
      return this.paraLeitura(criado);
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    produtoCodigo: string,
    armazemCodigo: string,
    input: IntegracaoEstoqueUpdate,
  ): Promise<IntegracaoEstoque> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.estoque.findFirst({
        where: {
          empresaId,
          deletedAt: null,
          produto: { codigoErp: produtoCodigo },
          armazem: { codigoErp: armazemCodigo },
        },
      });
      if (!existente)
        throw new NotFoundException('Saldo de estoque não encontrado');

      const atualizado = await tx.estoque.update({
        where: { id: existente.id },
        data: {
          ...(input.saldo !== undefined ? { saldo: input.saldo } : {}),
          ...(input.reserva !== undefined ? { reserva: input.reserva } : {}),
          ...(input.custo !== undefined ? { custo: input.custo } : {}),
          ...(input.ultimoPreco !== undefined
            ? { ultimoPreco: input.ultimoPreco }
            : {}),
          ...(input.ultimaCompra !== undefined
            ? { ultimaCompra: input.ultimaCompra }
            : {}),
          updatedBy: autor,
        },
        include: INCLUDE,
      });
      return this.paraLeitura(atualizado);
    });
  }

  async remove(
    empresaId: string,
    apiKeyId: string,
    produtoCodigo: string,
    armazemCodigo: string,
  ): Promise<void> {
    const autor = autorIntegracao(apiKeyId);
    await this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.estoque.findFirst({
        where: {
          empresaId,
          deletedAt: null,
          produto: { codigoErp: produtoCodigo },
          armazem: { codigoErp: armazemCodigo },
        },
      });
      if (!existente)
        throw new NotFoundException('Saldo de estoque não encontrado');
      await tx.estoque.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor },
      });
    });
  }
}
