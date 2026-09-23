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
  IntegracaoObjetivoLoteItem,
  IntegracaoLoteResultado,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';
import {
  camposDaDecisao,
  decidirUpsert,
  type DecisaoUpsert,
} from '../common/decidir-upsert';
import { processarLote } from '../common/processar-lote';
import { sincronizarFilhos } from '../common/sincronizar-filhos';

const INCLUDE = {
  vendedor: { select: { chave: true } },
  categorias: {
    where: { deletedAt: null },
    include: { categoria: { select: { chave: true } } },
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
      chave: row.chave ?? '',
      codigoErp: row.codigoErp,
      vendedorChave: row.vendedor.chave ?? '',
      mes: row.mes,
      ano: row.ano,
      valor: row.valor,
      numeroCliente: row.numeroCliente,
      novoCliente: row.novoCliente,
      tipo: row.tipo,
      ativo: row.ativo,
      categorias: row.categorias.map((c) => ({
        chave: c.chave ?? '',
        categoriaChave: c.categoria.chave ?? '',
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
          orderBy: { chave: 'asc' },
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
    chave: string,
  ): Promise<IntegracaoObjetivo> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.objetivoVendedorMes.findFirst({
        where: { empresaId, chave, deletedAt: null },
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
    const { registro } = await this.upsert(empresaId, apiKeyId, input);
    return registro;
  }

  /**
   * O mesmo upsert do `create`, devolvendo também **o que aconteceu**.
   *
   * Só o lote precisa dessa informação — é o que separa `criados` de
   * `atualizados` no relatório. O `create` continua devolvendo apenas o
   * registro, porque o REST individual responde a entidade e a decisão não
   * cabe no corpo dela.
   */
  async upsert(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoObjetivoCreate,
  ): Promise<{ registro: IntegracaoObjetivo; decisao: DecisaoUpsert }> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.objetivoVendedorMes.findFirst({
        where: { empresaId, chave: input.chave },
      });
      const decisao = decidirUpsert(existente);

      const vendedor = await tx.vendedor.findFirst({
        where: { empresaId, chave: input.vendedorChave, deletedAt: null },
        select: { id: true },
      });
      if (!vendedor)
        throw new NotFoundException(
          `vendedorChave '${input.vendedorChave}' não encontrado`,
        );

      const categoriasData = await Promise.all(
        input.categorias.map(async (linha) => {
          const categoria = await tx.categoria.findFirst({
            where: {
              empresaId,
              chave: linha.categoriaChave,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!categoria) {
            throw new NotFoundException(
              `categoriaChave '${linha.categoriaChave}' não encontrado`,
            );
          }
          return {
            empresaId,
            chave: linha.chave,
            categoriaId: categoria.id,
            valor: linha.valor,
          };
        }),
      );

      const dados = {
        chave: input.chave,
        codigoErp: input.codigoErp ?? null,
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
        // existe mais, e a que veio é casada pela chave.
        const atualizadoUpsert = await tx.objetivoVendedorMes.update({
          where: { id: existente!.id },
          data: {
            ...dados,
            ...camposDaDecisao(decisao),
            categorias: sincronizarFilhos(
              { campo: 'objetivoVendedorMesId', id: existente!.id },
              categoriasData,
            ),
          },
          include: INCLUDE,
        });
        return { registro: this.paraLeitura(atualizadoUpsert), decisao };
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
      return { registro: this.paraLeitura(criado), decisao };
    });
  }

  /**
   * Aplica um lote. Ver `processarLote` para a ordem e o tratamento de erro;
   * aqui fica só o que é da entidade.
   *
   * A reativação conta como `atualizado`: a linha já existia e mantém o mesmo
   * uuid — quem lê o relatório está conferindo quantos registros novos
   * entraram, e um código que volta do soft delete não é um deles.
   */
  upsertLote(
    empresaId: string,
    apiKeyId: string,
    registros: IntegracaoObjetivoLoteItem[],
  ): Promise<IntegracaoLoteResultado> {
    return processarLote(registros, async (item) => {
      if (item.excluido) {
        await this.remove(empresaId, apiKeyId, item.chave);
        return 'excluido';
      }
      const { decisao } = await this.upsert(
        empresaId,
        apiKeyId,
        item as IntegracaoObjetivoCreate,
      );
      return decisao === 'criar' ? 'criado' : 'atualizado';
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    chave: string,
    input: IntegracaoObjetivoUpdate,
  ): Promise<IntegracaoObjetivo> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.objetivoVendedorMes.findFirst({
        where: { empresaId, chave, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Objetivo não encontrado');

      let vendedorId: string | undefined;
      if (input.vendedorChave !== undefined) {
        const vendedor = await tx.vendedor.findFirst({
          where: {
            empresaId,
            chave: input.vendedorChave,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!vendedor)
          throw new NotFoundException(
            `vendedorChave '${input.vendedorChave}' não encontrado`,
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
                chave: linha.categoriaChave,
                deletedAt: null,
              },
              select: { id: true },
            });
            if (!categoria) {
              throw new NotFoundException(
                `categoriaChave '${linha.categoriaChave}' não encontrado`,
              );
            }
            return {
            empresaId,
            chave: linha.chave,
            categoriaId: categoria.id,
            valor: linha.valor,
          };
          }),
        );
        categoriasUpdate = {
          categorias: sincronizarFilhos(
          { campo: 'objetivoVendedorMesId', id: existente.id },
          categoriasData,
        ),
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
    chave: string,
  ): Promise<void> {
    const autor = autorIntegracao(apiKeyId);
    await this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.objetivoVendedorMes.findFirst({
        where: { empresaId, chave, deletedAt: null },
      });
      if (!existente) return;
      await tx.objetivoVendedorMes.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }
}
