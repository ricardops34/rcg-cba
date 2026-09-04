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
  IntegracaoRegraDescontoLoteItem,
  IntegracaoLoteResultado,
} from '@plataforma/contracts';
import { autorIntegracao } from '../common/autor-integracao';
import {
  camposDaDecisao,
  decidirUpsert,
  type DecisaoUpsert,
} from '../common/decidir-upsert';
import { processarLote } from '../common/processar-lote';

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
        delete: false,
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
    faixas = faixas.filter((f) => !f.delete);
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

  private async sincronizarFaixas(
    tx: TenantTx,
    empresaId: string,
    regraDescontoId: string,
    faixas: IntegracaoRegraDescontoFaixa[],
    autor: string,
  ) {
    const excluidas = faixas.filter((f) => f.delete).map((f) => f.sequencia);
    if (excluidas.length > 0) {
      await tx.regraDescontoFaixa.deleteMany({
        where: { empresaId, regraDescontoId, sequencia: { in: excluidas } },
      });
    }
    await Promise.all(
      faixas.filter((f) => !f.delete).map((f) =>
        tx.regraDescontoFaixa.upsert({
          where: {
            regraDescontoId_sequencia: { regraDescontoId, sequencia: f.sequencia },
          },
          create: {
            empresaId,
            regraDescontoId,
            sequencia: f.sequencia,
            percInicial: f.percInicial,
            percFinal: f.percFinal,
            percBaseComissao: f.percBaseComissao,
            createdBy: autor,
            updatedBy: autor,
          },
          update: {
            percInicial: f.percInicial,
            percFinal: f.percFinal,
            percBaseComissao: f.percBaseComissao,
            updatedBy: autor,
          },
        }),
      ),
    );
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
    input: IntegracaoRegraDescontoCreate,
  ): Promise<{ registro: IntegracaoRegraDesconto; decisao: DecisaoUpsert }> {
    const autor = autorIntegracao(apiKeyId);
    this.validarFaixas(input.faixas);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.regraDesconto.findFirst({
        where: { empresaId, codigoErp: input.codigoErp },
      });
      const decisao = decidirUpsert(existente);
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
        create: input.faixas.filter((f) => !f.delete).map((f) => ({
          sequencia: f.sequencia,
          percInicial: f.percInicial,
          percFinal: f.percFinal,
          percBaseComissao: f.percBaseComissao,
          empresaId,
          createdBy: autor,
          updatedBy: autor,
        })),
      };

      if (decisao !== 'criar') {
        // Cada faixa é tratada pela sequência; delete=true remove somente a
        // faixa indicada.
        await this.sincronizarFaixas(
          tx,
          empresaId,
          existente!.id,
          input.faixas,
          autor,
        );
        const atualizadoUpsert = await tx.regraDesconto.update({
          where: { id: existente!.id },
          data: { ...dados, ...camposDaDecisao(decisao) },
          include: INCLUDE,
        });
        return { registro: this.paraLeitura(atualizadoUpsert), decisao };
      }

      const criada = await tx.regraDesconto.create({
        data: { ...dados, empresaId, createdBy: autor, faixas },
        include: INCLUDE,
      });
      return { registro: this.paraLeitura(criada), decisao };
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
    registros: IntegracaoRegraDescontoLoteItem[],
  ): Promise<IntegracaoLoteResultado> {
    return processarLote(registros, async (item) => {
      if (item.excluido) {
        await this.remove(empresaId, apiKeyId, item.codigoErp);
        return 'excluido';
      }
      const { decisao } = await this.upsert(
        empresaId,
        apiKeyId,
        item as IntegracaoRegraDescontoCreate,
      );
      return decisao === 'criar' ? 'criado' : 'atualizado';
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
        await this.sincronizarFaixas(
          tx,
          empresaId,
          existente.id,
          input.faixas,
          autor,
        );
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
