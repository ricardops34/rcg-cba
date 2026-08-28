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
  camposDaDecisao,
  decidirUpsert,
} from '../common/decidir-upsert';
import { sincronizarFilhos } from '../common/sincronizar-filhos';

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
      codigoErp: row.codigoErp ?? '',
      vendedorCodigo: row.vendedor.codigoErp ?? '',
      mes: row.mes,
      ano: row.ano,
      valor: row.valor,
      numeroCliente: row.numeroCliente,
      novoCliente: row.novoCliente,
      tipo: row.tipo,
      ativo: row.ativo,
      categorias: row.categorias.map((c) => ({
        codigoErp: c.codigoErp ?? '',
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
          orderBy: { codigoErp: 'asc' },
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
    codigoErp: string,
  ): Promise<IntegracaoObjetivo> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.objetivoVendedorMes.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
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
        where: { empresaId, codigoErp: input.codigoErp },
      });
      const decisao = decidirUpsert(existente);

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
          return {
            empresaId,
            codigoErp: linha.codigoErp,
            categoriaId: categoria.id,
            valor: linha.valor,
          };
        }),
      );

      const dados = {
        codigoErp: input.codigoErp,
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

      if (decisao !== 'criar') {
        // O ERP manda o objetivo inteiro: categoria que não veio mais não
        // existe mais, e a que veio é casada pelo codigoErp.
        const atualizadoUpsert = await tx.objetivoVendedorMes.update({
          where: { id: existente!.id },
          data: {
            ...dados,
            ...camposDaDecisao(decisao),
            categorias: sincronizarFilhos(empresaId, categoriasData),
          },
          include: INCLUDE,
        });
        return this.paraLeitura(atualizadoUpsert);
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
    codigoErp: string,
    input: IntegracaoObjetivoUpdate,
  ): Promise<IntegracaoObjetivo> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.objetivoVendedorMes.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
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
            return {
            empresaId,
            codigoErp: linha.codigoErp,
            categoriaId: categoria.id,
            valor: linha.valor,
          };
          }),
        );
        categoriasUpdate = {
          categorias: sincronizarFilhos(empresaId, categoriasData),
        };
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
    codigoErp: string,
  ): Promise<void> {
    const autor = autorIntegracao(apiKeyId);
    await this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.objetivoVendedorMes.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Objetivo não encontrado');
      await tx.objetivoVendedorMes.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }
}
