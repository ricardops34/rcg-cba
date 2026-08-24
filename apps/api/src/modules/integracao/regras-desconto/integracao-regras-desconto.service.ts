import {
  BadRequestException,
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
  IntegracaoRegraDesconto,
  IntegracaoRegraDescontoCreate,
  IntegracaoRegraDescontoFaixa,
  IntegracaoRegraDescontoQuery,
  IntegracaoRegraDescontoUpdate,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';
import {
  deveReativar,
  LIMPAR_EXCLUSAO,
} from '../common/reativar-excluido';

const INCLUDE = {
  faixas: { orderBy: { sequencia: 'asc' } },
} satisfies Prisma.RegraDescontoInclude;
type RegraComFaixas = Prisma.RegraDescontoGetPayload<{
  include: typeof INCLUDE;
}>;

@Injectable()
export class IntegracaoRegrasDescontoService {
  constructor(private readonly prisma: PrismaService) {}

  private paraLeitura(row: RegraComFaixas): IntegracaoRegraDesconto {
    return {
      id: row.id,
      codigoErp: row.codigoErp ?? '',
      descricao: row.descricao,
      percDescontoAutorizado: row.percDescontoAutorizado,
      percDescontoMaximo: row.percDescontoMaximo,
      percComissao: row.percComissao,
      padrao: row.padrao,
      ativo: row.ativo,
      faixas: row.faixas.map((f) => ({
        sequencia: f.sequencia,
        percInicial: f.percInicial,
        percFinal: f.percFinal,
        percBaseComissao: f.percBaseComissao,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  /** Mesma regra da tela: sequência única e faixas que não se sobrepõem. */
  private validarFaixas(faixas: IntegracaoRegraDescontoFaixa[]) {
    if (new Set(faixas.map((f) => f.sequencia)).size !== faixas.length) {
      throw new BadRequestException('Há faixas com a mesma sequência');
    }
    const ordenadas = [...faixas].sort((a, b) => a.percInicial - b.percInicial);
    for (let i = 0; i < ordenadas.length; i++) {
      if (ordenadas[i].percFinal < ordenadas[i].percInicial) {
        throw new BadRequestException(
          `A faixa ${ordenadas[i].sequencia} termina antes de começar`,
        );
      }
      if (i > 0 && ordenadas[i].percInicial <= ordenadas[i - 1].percFinal) {
        throw new BadRequestException(
          `As faixas ${ordenadas[i - 1].sequencia} e ${ordenadas[i].sequencia} se sobrepõem`,
        );
      }
    }
  }

  /** Só uma regra padrão por empresa. */
  private async garantirPadraoUnico(
    tx: TenantTx,
    empresaId: string,
    idAtual?: string,
  ) {
    await tx.regraDesconto.updateMany({
      where: {
        empresaId,
        padrao: true,
        deletedAt: null,
        ...(idAtual ? { NOT: { id: idAtual } } : {}),
      },
      data: { padrao: false },
    });
  }

  findAll(empresaId: string, query: IntegracaoRegraDescontoQuery) {
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
        tx.regraDesconto.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { codigoErp: 'asc' },
        }),
        tx.regraDesconto.count({ where }),
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
  ): Promise<IntegracaoRegraDesconto> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.regraDesconto.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
        include: INCLUDE,
      });
      if (!row) throw new NotFoundException('Regra de desconto não encontrada');
      return this.paraLeitura(row);
    });
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoRegraDescontoCreate,
  ): Promise<IntegracaoRegraDesconto> {
    const autor = autorIntegracao(apiKeyId);
    this.validarFaixas(input.faixas);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.regraDesconto.findFirst({
        where: { empresaId, codigoErp: input.codigoErp },
      });
      const reativar = deveReativar(
        existente,
        `Já existe regra de desconto com codigoErp '${input.codigoErp}'`,
      );
      if (input.padrao) await this.garantirPadraoUnico(tx, empresaId);

      const dados = {
        codigoErp: input.codigoErp,
        descricao: input.descricao,
        percDescontoAutorizado: input.percDescontoAutorizado,
        percDescontoMaximo: input.percDescontoMaximo,
        percComissao: input.percComissao,
        padrao: input.padrao,
        ativo: input.ativo,
        updatedBy: autor,
      };
      const faixas = {
        create: input.faixas.map((f) => ({
          ...f,
          empresaId,
          createdBy: autor,
          updatedBy: autor,
        })),
      };

      if (reativar) {
        // As faixas do payload substituem as da regra excluída — mesma regra
        // do `update`.
        await tx.regraDescontoFaixa.deleteMany({
          where: { regraDescontoId: existente!.id, empresaId },
        });
        const reativada = await tx.regraDesconto.update({
          where: { id: existente!.id },
          data: { ...dados, ...LIMPAR_EXCLUSAO, faixas },
          include: INCLUDE,
        });
        return this.paraLeitura(reativada);
      }

      const criada = await tx.regraDesconto.create({
        data: { ...dados, empresaId, createdBy: autor, faixas },
        include: INCLUDE,
      });
      return this.paraLeitura(criada);
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    codigoErp: string,
    input: IntegracaoRegraDescontoUpdate,
  ): Promise<IntegracaoRegraDesconto> {
    const autor = autorIntegracao(apiKeyId);
    if (input.faixas) this.validarFaixas(input.faixas);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.regraDesconto.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente) {
        throw new NotFoundException('Regra de desconto não encontrada');
      }
      if (input.padrao) {
        await this.garantirPadraoUnico(tx, empresaId, existente.id);
      }

      if (input.faixas) {
        await tx.regraDescontoFaixa.deleteMany({
          where: { regraDescontoId: existente.id, empresaId },
        });
      }

      const atualizada = await tx.regraDesconto.update({
        where: { id: existente.id },
        data: {
          ...(input.descricao !== undefined
            ? { descricao: input.descricao }
            : {}),
          ...(input.percDescontoAutorizado !== undefined
            ? { percDescontoAutorizado: input.percDescontoAutorizado }
            : {}),
          ...(input.percDescontoMaximo !== undefined
            ? { percDescontoMaximo: input.percDescontoMaximo }
            : {}),
          ...(input.percComissao !== undefined
            ? { percComissao: input.percComissao }
            : {}),
          ...(input.padrao !== undefined ? { padrao: input.padrao } : {}),
          ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
          updatedBy: autor,
          ...(input.faixas
            ? {
                faixas: {
                  create: input.faixas.map((f) => ({
                    ...f,
                    empresaId,
                    createdBy: autor,
                    updatedBy: autor,
                  })),
                },
              }
            : {}),
        },
        include: INCLUDE,
      });
      return this.paraLeitura(atualizada);
    });
  }

  async remove(
    empresaId: string,
    apiKeyId: string,
    codigoErp: string,
  ): Promise<void> {
    const autor = autorIntegracao(apiKeyId);
    await this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.regraDesconto.findFirst({
        where: { empresaId, codigoErp, deletedAt: null },
      });
      if (!existente) {
        throw new NotFoundException('Regra de desconto não encontrada');
      }
      await tx.regraDesconto.update({
        where: { id: existente.id },
        data: {
          deletedAt: new Date(),
          deletedBy: autor,
          ativo: false,
          padrao: false,
        },
      });
    });
  }
}
