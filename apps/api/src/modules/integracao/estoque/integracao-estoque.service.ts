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
  IntegracaoEstoqueLoteItem,
  IntegracaoLoteResultado,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';
import {
  camposDaDecisao,
  decidirUpsert,
  type DecisaoUpsert,
} from '../common/decidir-upsert';
import { processarLote } from '../common/processar-lote';
import { resolverProduto } from '../common/resolver-produto';

const INCLUDE = {
  produto: { select: { chave: true } },
  armazem: { select: { chave: true } },
} satisfies Prisma.EstoqueInclude;
type EstoqueComRelacoes = Prisma.EstoqueGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class IntegracaoEstoqueService {
  constructor(private readonly prisma: PrismaService) {}

  private paraLeitura(row: EstoqueComRelacoes): IntegracaoEstoque {
    return {
      id: row.id,
      chave: row.chave ?? '',
      codigoErp: row.codigoErp,
      produtoChave: row.produto.chave ?? '',
      armazemChave: row.armazem.chave ?? '',
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
        ...(query.chave ? { chave: query.chave } : {}),
        ...(query.produtoChave
          ? { produto: { chave: query.produtoChave } }
          : {}),
        ...(query.armazemChave
          ? { armazem: { chave: query.armazemChave } }
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

  async findOne(empresaId: string, chave: string): Promise<IntegracaoEstoque> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.estoque.findFirst({
        where: {
          empresaId,
          deletedAt: null,
          chave,
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
    input: IntegracaoEstoqueCreate,
  ): Promise<{ registro: IntegracaoEstoque; decisao: DecisaoUpsert }> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const produto = await resolverProduto(tx, empresaId, input.produtoChave);
      const armazem = await tx.armazem.findFirst({
        where: { empresaId, chave: input.armazemChave, deletedAt: null },
        select: { id: true },
      });
      if (!armazem)
        throw new NotFoundException(
          `armazemChave '${input.armazemChave}' não encontrado`,
        );

      const existente = await tx.estoque.findFirst({
        where: {
          empresaId,
          OR: [
            { chave: input.chave },
            { produtoId: produto.id, armazemId: armazem.id },
          ],
        },
      });
      const decisao = decidirUpsert(existente);

      const dados = {
        chave: input.chave,
        codigoErp: input.codigoErp ?? '',
        produtoId: produto.id,
        armazemId: armazem.id,
        saldo: input.saldo,
        reserva: input.reserva ?? null,
        custo: input.custo ?? null,
        ultimoPreco: input.ultimoPreco ?? null,
        ultimaCompra: input.ultimaCompra ?? null,
        updatedBy: autor,
      };

      if (decisao !== 'criar') {
        const atualizadoUpsert = await tx.estoque.update({
          where: { id: existente!.id },
          data: { ...dados, ...camposDaDecisao(decisao) },
          include: INCLUDE,
        });
        return { registro: this.paraLeitura(atualizadoUpsert), decisao };
      }

      const criado = await tx.estoque.create({
        data: { ...dados, empresaId, createdBy: autor },
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
    registros: IntegracaoEstoqueLoteItem[],
  ): Promise<IntegracaoLoteResultado> {
    return processarLote(registros, async (item) => {
      if (item.excluido) {
        await this.remove(empresaId, apiKeyId, item.chave);
        return 'excluido';
      }
      const { decisao } = await this.upsert(
        empresaId,
        apiKeyId,
        item as IntegracaoEstoqueCreate,
      );
      return decisao === 'criar' ? 'criado' : 'atualizado';
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    chave: string,
    input: IntegracaoEstoqueUpdate,
  ): Promise<IntegracaoEstoque> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.estoque.findFirst({
        where: {
          empresaId,
          deletedAt: null,
          chave,
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
    chave: string,
  ): Promise<void> {
    const autor = autorIntegracao(apiKeyId);
    await this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.estoque.findFirst({
        where: {
          empresaId,
          deletedAt: null,
          chave,
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
