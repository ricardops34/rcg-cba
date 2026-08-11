import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  ParametroEmpresaCreate,
  ParametroEmpresaQuery,
  ParametroEmpresaUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const SORT_FIELDS = new Set(['parametro', 'tipo', 'ativo', 'createdAt']);

type ParametroRow = {
  id: string;
  empresaId: string;
  parametro: string;
  tipo: string;
  tamanho: number | null;
  conteudo: string | null;
  descricao: string | null;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
};

/**
 * Parâmetros do sistema por empresa. Duas responsabilidades:
 *
 * - **CRUD** da tela de Administração > Parâmetros;
 * - **leitura tipada** para o resto do backend (`obterNumero`, `obterBoolean`,
 *   `obterTexto`), que converte o `conteudo` textual conforme o `tipo` e cai
 *   num default quando o parâmetro não existe ou está vazio.
 */
@Injectable()
export class ParametrosService {
  constructor(private readonly prisma: PrismaService) {}

  /** Conteúdo de tipo senha nunca sai da API — só a informação de que existe. */
  private paraLeitura(row: ParametroRow) {
    const ehSenha = row.tipo === 'senha';
    return {
      ...row,
      conteudo: ehSenha ? null : row.conteudo,
      preenchido: !!row.conteudo,
    };
  }

  /**
   * Rejeita conteúdo que não corresponde ao tipo declarado — sem isso um
   * 'abc' num parâmetro numérico só apareceria como erro lá na frente, em
   * quem consome.
   */
  private validarConteudo(
    tipo: string | undefined,
    conteudo: string | null | undefined,
    tamanho: number | null | undefined,
  ) {
    if (conteudo == null || conteudo === '') return;
    if (tipo === 'numero' && Number.isNaN(Number(conteudo))) {
      throw new BadRequestException('Conteúdo deve ser um número');
    }
    if (tipo === 'booleano' && !['true', 'false'].includes(conteudo)) {
      throw new BadRequestException('Conteúdo deve ser "true" ou "false"');
    }
    if (tipo === 'data' && Number.isNaN(new Date(conteudo).getTime())) {
      throw new BadRequestException('Conteúdo deve ser uma data válida');
    }
    if (tamanho && conteudo.length > tamanho) {
      throw new BadRequestException(
        `Conteúdo excede o tamanho do parâmetro (${tamanho})`,
      );
    }
  }

  findAll(empresaId: string, query: ParametroEmpresaQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.tipo ? { tipo: query.tipo } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  parametro: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  descricao: {
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
          : 'parametro';
      const [data, total] = await Promise.all([
        tx.parametroEmpresa.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.parametroEmpresa.count({ where }),
      ]);
      return buildPaginatedResult(
        data.map((r) => this.paraLeitura(r)),
        total,
        query,
      );
    });
  }

  async findOne(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.parametroEmpresa.findFirst({
        where: { id, empresaId, deletedAt: null },
      });
      if (!row) throw new NotFoundException('Parâmetro não encontrado');
      return this.paraLeitura(row);
    });
  }

  create(
    empresaId: string,
    user: AuthenticatedUser,
    input: ParametroEmpresaCreate,
  ) {
    this.validarConteudo(input.tipo, input.conteudo, input.tamanho);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.parametroEmpresa.findFirst({
        where: { empresaId, parametro: input.parametro, deletedAt: null },
        select: { id: true },
      });
      if (existente) {
        throw new ConflictException(
          `Já existe o parâmetro '${input.parametro}' nesta empresa`,
        );
      }
      const row = await tx.parametroEmpresa.create({
        data: {
          ...input,
          conteudo: input.conteudo ?? null,
          descricao: input.descricao ?? null,
          tamanho: input.tamanho ?? null,
          empresaId,
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
      return this.paraLeitura(row);
    });
  }

  async update(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    input: ParametroEmpresaUpdate,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const atual = await tx.parametroEmpresa.findFirst({
        where: { id, empresaId, deletedAt: null },
      });
      if (!atual) throw new NotFoundException('Parâmetro não encontrado');

      this.validarConteudo(
        input.tipo ?? atual.tipo,
        input.conteudo,
        input.tamanho !== undefined ? input.tamanho : atual.tamanho,
      );

      const row = await tx.parametroEmpresa.update({
        where: { id },
        data: {
          ...input,
          // Senha em branco no formulário significa "manter a atual", e não
          // "apagar" — o valor nunca é exibido para ser redigitado.
          ...(atual.tipo === 'senha' && !input.conteudo
            ? { conteudo: atual.conteudo }
            : {}),
          updatedBy: user.id,
        },
      });
      return this.paraLeitura(row);
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const atual = await tx.parametroEmpresa.findFirst({
        where: { id, empresaId, deletedAt: null },
        select: { id: true },
      });
      if (!atual) throw new NotFoundException('Parâmetro não encontrado');
      await tx.parametroEmpresa.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
      return { success: true };
    });
  }

  // ------------------------------------------------------------------
  // Leitura tipada, para o resto do backend
  // ------------------------------------------------------------------

  /** Conteúdo cru de um parâmetro ativo, ou null. Aceita tx pra reaproveitar a transação. */
  private async conteudoDe(
    empresaId: string,
    parametro: string,
    tx?: TenantTx,
  ): Promise<string | null> {
    const buscar = async (t: TenantTx) => {
      const row = await t.parametroEmpresa.findFirst({
        where: { empresaId, parametro, ativo: true, deletedAt: null },
        select: { conteudo: true },
      });
      return row?.conteudo ?? null;
    };
    return tx
      ? buscar(tx)
      : this.prisma.withTenant(empresaId, (t) => buscar(t));
  }

  async obterNumero(
    empresaId: string,
    parametro: string,
    padrao: number,
    tx?: TenantTx,
  ): Promise<number> {
    const conteudo = await this.conteudoDe(empresaId, parametro, tx);
    if (conteudo == null || conteudo === '') return padrao;
    const n = Number(conteudo);
    return Number.isNaN(n) ? padrao : n;
  }

  async obterBoolean(
    empresaId: string,
    parametro: string,
    padrao: boolean,
    tx?: TenantTx,
  ): Promise<boolean> {
    const conteudo = await this.conteudoDe(empresaId, parametro, tx);
    if (conteudo == null || conteudo === '') return padrao;
    return conteudo === 'true';
  }

  async obterTexto(
    empresaId: string,
    parametro: string,
    padrao: string | null = null,
    tx?: TenantTx,
  ): Promise<string | null> {
    const conteudo = await this.conteudoDe(empresaId, parametro, tx);
    return conteudo == null || conteudo === '' ? padrao : conteudo;
  }
}
