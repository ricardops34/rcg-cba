import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  Prisma,
  type TenantTx,
} from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type {
  IntegracaoCategoria,
  IntegracaoCategoriaCreate,
  IntegracaoCategoriaLoteItem,
  IntegracaoCategoriaQuery,
  IntegracaoCategoriaUpdate,
  IntegracaoLoteResultado,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';
import {
  camposDaDecisao,
  decidirUpsert,
  type DecisaoUpsert,
} from '../common/decidir-upsert';
import { processarLote } from '../common/processar-lote';
import { resolverRegraDesconto } from '../common/resolver-regra-desconto';

const INCLUDE = {
  categoriaPai: { select: { chave: true } },
  regraDesconto: { select: { chave: true } },
} satisfies Prisma.CategoriaInclude;
type CategoriaComPai = Prisma.CategoriaGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class IntegracaoCategoriasService {
  constructor(private readonly prisma: PrismaService) {}

  private paraLeitura(row: CategoriaComPai): IntegracaoCategoria {
    return {
      id: row.id,
      chave: row.chave ?? '',
      codigoErp: row.codigoErp,
      descricao: row.descricao,
      categoriaPaiChave: row.categoriaPai?.chave ?? null,
      regraDescontoChave: row.regraDesconto?.chave ?? null,
      ativo: row.ativo,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  findAll(empresaId: string, query: IntegracaoCategoriaQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.search
          ? {
              descricao: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            }
          : {}),
      };
      const [data, total] = await Promise.all([
        tx.categoria.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { chave: 'asc' },
        }),
        tx.categoria.count({ where }),
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
  ): Promise<IntegracaoCategoria> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.categoria.findFirst({
        where: { empresaId, chave, deletedAt: null },
        include: INCLUDE,
      });
      if (!row) throw new NotFoundException('Categoria não encontrada');
      return this.paraLeitura(row);
    });
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoCategoriaCreate,
  ): Promise<IntegracaoCategoria> {
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
    input: IntegracaoCategoriaCreate,
  ): Promise<{ registro: IntegracaoCategoria; decisao: DecisaoUpsert }> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.categoria.findFirst({
        where: { empresaId, chave: input.chave },
      });
      const decisao = decidirUpsert(existente);

      const categoriaPaiId = await this.resolverCategoriaPai(
        tx,
        empresaId,
        input.categoriaPaiChave,
      );

      const regraDescontoId = await resolverRegraDesconto(
        tx,
        empresaId,
        input.regraDescontoChave,
      );

      const dados = {
        chave: input.chave,
        codigoErp: input.codigoErp ?? '',
        descricao: input.descricao,
        categoriaPaiId,
        regraDescontoId: regraDescontoId ?? null,
        ativo: input.ativo,
        updatedBy: autor,
      };

      if (decisao !== 'criar') {
        const atualizadoUpsert = await tx.categoria.update({
          where: { id: existente!.id },
          data: { ...dados, ...camposDaDecisao(decisao) },
          include: INCLUDE,
        });
        return { registro: this.paraLeitura(atualizadoUpsert), decisao };
      }

      const criada = await tx.categoria.create({
        data: { ...dados, empresaId, createdBy: autor },
        include: INCLUDE,
      });
      return { registro: this.paraLeitura(criada), decisao };
    });
  }

  /**
   * Aplica um lote de categorias. Ver `processarLote` para a ordem e o
   * tratamento de erro; aqui fica só o que é da entidade.
   *
   * A reativação conta como `atualizado`: a linha já existia e mantém o mesmo
   * uuid — quem lê o relatório está conferindo quantos registros novos
   * entraram, e um código que volta do soft delete não é um deles.
   */
  upsertLote(
    empresaId: string,
    apiKeyId: string,
    registros: IntegracaoCategoriaLoteItem[],
  ): Promise<IntegracaoLoteResultado> {
    return processarLote(registros, async (item) => {
      if (item.excluido) {
        await this.remove(empresaId, apiKeyId, item.chave);
        return 'excluido';
      }
      const { decisao } = await this.upsert(
        empresaId,
        apiKeyId,
        item as IntegracaoCategoriaCreate,
      );
      return decisao === 'criar' ? 'criado' : 'atualizado';
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    chave: string,
    input: IntegracaoCategoriaUpdate,
  ): Promise<IntegracaoCategoria> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.categoria.findFirst({
        where: { empresaId, chave, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Categoria não encontrada');

      const categoriaPaiId =
        input.categoriaPaiChave !== undefined
          ? await this.resolverCategoriaPai(
              tx,
              empresaId,
              input.categoriaPaiChave,
            )
          : undefined;

      const regraDescontoId = await resolverRegraDesconto(
        tx,
        empresaId,
        input.regraDescontoChave,
      );

      const atualizada = await tx.categoria.update({
        where: { id: existente.id },
        data: {
          ...(input.codigoErp !== undefined
            ? { codigoErp: input.codigoErp ?? '' }
            : {}),
          ...(input.descricao !== undefined
            ? { descricao: input.descricao }
            : {}),
          ...(categoriaPaiId !== undefined ? { categoriaPaiId } : {}),
          ...(regraDescontoId !== undefined ? { regraDescontoId } : {}),
          ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
          updatedBy: autor,
        },
        include: INCLUDE,
      });
      return this.paraLeitura(atualizada);
    });
  }

  async remove(
    empresaId: string,
    apiKeyId: string,
    chave: string,
  ): Promise<void> {
    const autor = autorIntegracao(apiKeyId);
    await this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.categoria.findFirst({
        where: { empresaId, chave, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Categoria não encontrada');
      await tx.categoria.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }

  private async resolverCategoriaPai(
    tx: TenantTx,
    empresaId: string,
    categoriaPaiChave: string | null | undefined,
  ) {
    if (!categoriaPaiChave) return null;
    const pai = await tx.categoria.findFirst({
      where: { empresaId, chave: categoriaPaiChave, deletedAt: null },
      select: { id: true },
    });
    if (!pai)
      throw new NotFoundException(
        `categoriaPaiChave '${categoriaPaiChave}' não encontrado`,
      );
    return pai.id;
  }
}
