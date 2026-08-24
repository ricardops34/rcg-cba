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
  IntegracaoObjetivo,
  IntegracaoObjetivoCreate,
  IntegracaoObjetivoQuery,
  IntegracaoObjetivoUpdate,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';
import {
  deveReativar,
  LIMPAR_EXCLUSAO,
} from '../common/reativar-excluido';

const INCLUDE = {
  vendedor: { select: { codigoErp: true } },
  categorias: {
    where: { deletedAt: null },
    include: { categoria: { select: { codigoErp: true } } },
  },
} satisfies Prisma.ObjetivoVendedorMesInclude;
type ObjetivoComRelacoes = Prisma.ObjetivoVendedorMesGetPayload<{
  include: typeof INCLUDE;
}>;

@Injectable()
export class IntegracaoObjetivosService {
  constructor(private readonly prisma: PrismaService) {}

  private paraLeitura(row: ObjetivoComRelacoes): IntegracaoObjetivo {
    return {
      id: row.id,
      codigoLegado: row.codigoLegado ?? 0,
      vendedorCodigo: row.vendedor.codigoErp ?? '',
      mes: row.mes,
      ano: row.ano,
      valor: row.valor,
      numeroCliente: row.numeroCliente,
      novoCliente: row.novoCliente,
      tipo: row.tipo,
      ativo: row.ativo,
      categorias: row.categorias.map((c) => ({
        categoriaCodigo: c.categoria.codigoErp,
        valor: c.valor,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  findAll(empresaId: string, query: IntegracaoObjetivoQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.ano !== undefined ? { ano: query.ano } : {}),
        ...(query.mes !== undefined ? { mes: query.mes } : {}),
      };
      const [data, total] = await Promise.all([
        tx.objetivoVendedorMes.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { codigoLegado: 'asc' },
        }),
        tx.objetivoVendedorMes.count({ where }),
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
    codigoLegado: number,
  ): Promise<IntegracaoObjetivo> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.objetivoVendedorMes.findFirst({
        where: { empresaId, codigoLegado, deletedAt: null },
        include: INCLUDE,
      });
      if (!row) throw new NotFoundException('Objetivo não encontrado');
      return this.paraLeitura(row);
    });
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoObjetivoCreate,
  ): Promise<IntegracaoObjetivo> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.objetivoVendedorMes.findFirst({
        where: { empresaId, codigoLegado: input.codigoLegado },
      });
      const reativar = deveReativar(
        existente,
        `Já existe objetivo com codigoLegado '${input.codigoLegado}'`,
      );

      const vendedor = await tx.vendedor.findFirst({
        where: { empresaId, codigoErp: input.vendedorCodigo, deletedAt: null },
        select: { id: true },
      });
      if (!vendedor)
        throw new NotFoundException(
          `vendedorCodigo '${input.vendedorCodigo}' não encontrado`,
        );

      const categoriasData = await Promise.all(
        input.categorias.map(async (linha) => {
          const categoria = await tx.categoria.findFirst({
            where: {
              empresaId,
              codigoErp: linha.categoriaCodigo,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!categoria) {
            throw new NotFoundException(
              `categoriaCodigo '${linha.categoriaCodigo}' não encontrado`,
            );
          }
          return { empresaId, categoriaId: categoria.id, valor: linha.valor };
        }),
      );

      const dados = {
        codigoLegado: input.codigoLegado,
        vendedorId: vendedor.id,
        mes: input.mes,
        ano: input.ano,
        valor: input.valor,
        numeroCliente: input.numeroCliente ?? null,
        novoCliente: input.novoCliente ?? null,
        tipo: input.tipo ?? null,
        ativo: input.ativo,
        updatedBy: autor,
      };

      if (reativar) {
        // As categorias do payload substituem as do objetivo excluído —
        // mesma regra do `update`.
        await tx.objetivoVendedorCategoria.deleteMany({
          where: { objetivoVendedorMesId: existente!.id },
        });
        const reativado = await tx.objetivoVendedorMes.update({
          where: { id: existente!.id },
          data: {
            ...dados,
            ...LIMPAR_EXCLUSAO,
            categorias: { create: categoriasData },
          },
          include: INCLUDE,
        });
        return this.paraLeitura(reativado);
      }

      const criado = await tx.objetivoVendedorMes.create({
        data: {
          ...dados,
          empresaId,
          createdBy: autor,
          categorias: { create: categoriasData },
        },
        include: INCLUDE,
      });
      return this.paraLeitura(criado);
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    codigoLegado: number,
    input: IntegracaoObjetivoUpdate,
  ): Promise<IntegracaoObjetivo> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.objetivoVendedorMes.findFirst({
        where: { empresaId, codigoLegado, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Objetivo não encontrado');

      let vendedorId: string | undefined;
      if (input.vendedorCodigo !== undefined) {
        const vendedor = await tx.vendedor.findFirst({
          where: {
            empresaId,
            codigoErp: input.vendedorCodigo,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!vendedor)
          throw new NotFoundException(
            `vendedorCodigo '${input.vendedorCodigo}' não encontrado`,
          );
        vendedorId = vendedor.id;
      }

      let categoriasUpdate: Record<string, unknown> = {};
      if (input.categorias) {
        const categoriasData = await Promise.all(
          input.categorias.map(async (linha) => {
            const categoria = await tx.categoria.findFirst({
              where: {
                empresaId,
                codigoErp: linha.categoriaCodigo,
                deletedAt: null,
              },
              select: { id: true },
            });
            if (!categoria) {
              throw new NotFoundException(
                `categoriaCodigo '${linha.categoriaCodigo}' não encontrado`,
              );
            }
            return { empresaId, categoriaId: categoria.id, valor: linha.valor };
          }),
        );
        await tx.objetivoVendedorCategoria.deleteMany({
          where: { objetivoVendedorMesId: existente.id },
        });
        categoriasUpdate = { categorias: { create: categoriasData } };
      }

      const atualizado = await tx.objetivoVendedorMes.update({
        where: { id: existente.id },
        data: {
          ...(vendedorId !== undefined ? { vendedorId } : {}),
          ...(input.mes !== undefined ? { mes: input.mes } : {}),
          ...(input.ano !== undefined ? { ano: input.ano } : {}),
          ...(input.valor !== undefined ? { valor: input.valor } : {}),
          ...(input.numeroCliente !== undefined
            ? { numeroCliente: input.numeroCliente }
            : {}),
          ...(input.novoCliente !== undefined
            ? { novoCliente: input.novoCliente }
            : {}),
          ...(input.tipo !== undefined ? { tipo: input.tipo } : {}),
          ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
          updatedBy: autor,
          ...categoriasUpdate,
        },
        include: INCLUDE,
      });
      return this.paraLeitura(atualizado);
    });
  }

  async remove(
    empresaId: string,
    apiKeyId: string,
    codigoLegado: number,
  ): Promise<void> {
    const autor = autorIntegracao(apiKeyId);
    await this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.objetivoVendedorMes.findFirst({
        where: { empresaId, codigoLegado, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Objetivo não encontrado');
      await tx.objetivoVendedorMes.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }
}
