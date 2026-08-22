import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, type TenantTx } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  ContaBancariaCreate,
  ContaBancariaQuery,
  ContaBancariaUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const SORT_FIELDS = new Set(['descricao', 'banco', 'agencia', 'ativo', 'createdAt']);

/**
 * Convênio de cobrança da empresa — insumo da 2ª via de boleto
 * (ver `docs/planos/segunda-via-danfe-boleto.md`).
 *
 * Cadastro pequeno e sem escopo de vendedor: é dado da empresa, e quem
 * administra vê todas as contas dela. O corte por tenant é o RLS, como nas
 * demais tabelas de negócio.
 */
@Injectable()
export class ContasBancariasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, query: ContaBancariaQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  descricao: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                { agencia: { contains: query.search } },
                { conta: { contains: query.search } },
              ],
            }
          : {}),
      };
      const sortField =
        query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'descricao';

      const [data, total] = await Promise.all([
        tx.contaBancaria.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.contaBancaria.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const conta = await tx.contaBancaria.findFirst({
        where: { id, empresaId, deletedAt: null },
      });
      if (!conta) throw new NotFoundException('Conta bancária não encontrada');
      return conta;
    });
  }

  async create(
    empresaId: string,
    user: AuthenticatedUser,
    input: ContaBancariaCreate,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const conta = await tx.contaBancaria.create({
        data: { ...input, empresaId, createdBy: user.id },
      });
      if (conta.padrao) await this.desmarcarOutrosPadroes(tx, empresaId, conta.id);
      return conta;
    });
  }

  async update(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    input: ContaBancariaUpdate,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existe = await tx.contaBancaria.findFirst({
        where: { id, empresaId, deletedAt: null },
        select: { id: true },
      });
      if (!existe) throw new NotFoundException('Conta bancária não encontrada');

      const conta = await tx.contaBancaria.update({
        where: { id },
        data: { ...input, updatedBy: user.id },
      });
      if (conta.padrao) await this.desmarcarOutrosPadroes(tx, empresaId, conta.id);
      return conta;
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existe = await tx.contaBancaria.findFirst({
        where: { id, empresaId, deletedAt: null },
        select: { id: true },
      });
      if (!existe) throw new NotFoundException('Conta bancária não encontrada');

      // Soft delete e nada mais: os títulos que apontam para esta conta
      // continuam apontando. Quebrar o vínculo apagaria a informação de qual
      // convênio registrou aquele boleto — que é justamente o que a 2ª via
      // precisa saber para reimprimir igual ao original.
      return tx.contaBancaria.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedBy: user.id,
          ativo: false,
          padrao: false,
        },
      });
    });
  }

  /**
   * Conta usada por um título que não aponta nenhuma.
   *
   * É o caso de **todo título já importado do legado**: a coluna nasceu vazia.
   * Sem uma conta padrão a 2ª via não sai, e a mensagem de erro precisa dizer
   * isso — daí devolver null em vez de lançar, deixando a decisão para quem
   * chama.
   */
  contaPadrao(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.contaBancaria.findFirst({
        where: { empresaId, deletedAt: null, ativo: true, padrao: true },
      }),
    );
  }

  /**
   * Só uma conta padrão por empresa.
   *
   * Feito por atualização em massa depois de gravar, e não por validação
   * antes: marcar a nova como padrão é justamente como se troca a padrão, e
   * recusar o segundo cadastro obrigaria o usuário a desmarcar a antiga
   * primeiro para conseguir salvar.
   */
  private desmarcarOutrosPadroes(
    tx: TenantTx,
    empresaId: string,
    manterId: string,
  ) {
    return tx.contaBancaria.updateMany({
      where: { empresaId, padrao: true, id: { not: manterId } },
      data: { padrao: false },
    });
  }
}
