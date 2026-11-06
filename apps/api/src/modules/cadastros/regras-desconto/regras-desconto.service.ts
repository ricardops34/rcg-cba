import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  type TenantTx,
} from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import type {
  RegraDescontoCreate,
  RegraDescontoFaixaLinha,
  RegraDescontoQuery,
  RegraDescontoUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

const SORT_FIELDS = new Set([
  'descricao',
  'codigoErp',
  'percDescontoAutorizado',
  'percDescontoMaximo',
  'percComissao',
  'padrao',
  'ativo',
  'createdAt',
]);

// As faixas sempre acompanham a regra: são poucas por regra (13 na maior do
// ERP) e a tela é mestre-detalhe, então não vale uma rota separada.
const INCLUDE = { faixas: { orderBy: { sequencia: 'asc' as const } } };

@Injectable()
export class RegrasDescontoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Faixas são um conjunto fechado: sequência única e intervalos que não se
   * cruzam. Sobreposição tornaria ambígua a comissão de um desconto — melhor
   * barrar na gravação do que descobrir na hora de pagar.
   */
  private validarFaixas(faixas: RegraDescontoFaixaLinha[]) {
    const sequencias = new Set(faixas.map((f) => f.sequencia));
    if (sequencias.size !== faixas.length) {
      throw new BadRequestException('Há faixas com a mesma sequência');
    }
    const ordenadas = [...faixas].sort((a, b) => a.percInicial - b.percInicial);
    for (let i = 1; i < ordenadas.length; i++) {
      if (ordenadas[i].percInicial <= ordenadas[i - 1].percFinal) {
        throw new BadRequestException(
          `As faixas de ${ordenadas[i - 1].percInicial}% a ${ordenadas[i - 1].percFinal}% e ` +
            `de ${ordenadas[i].percInicial}% a ${ordenadas[i].percFinal}% se sobrepõem`,
        );
      }
    }
  }

  /** Só uma regra padrão por empresa — a nova tira o padrão da anterior. */
  private async garantirPadraoUnico(
    tx: TenantTx,
    empresaId: string,
    idAtual?: string,
  ) {
    // A padrão que veio do ERP é dele: a próxima carga a devolveria ao estado
    // original e a empresa ficaria com duas padrão. Troca-se lá.
    const doErp = await tx.regraDesconto.findFirst({
      where: {
        empresaId,
        padrao: true,
        deletedAt: null,
        chave: { not: null },
        ...(idAtual ? { NOT: { id: idAtual } } : {}),
      },
      select: { descricao: true },
    });
    if (doErp) {
      throw new ConflictException(
        `A regra padrão atual ('${doErp.descricao}') vem do ERP e só pode ser trocada lá.`,
      );
    }
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

  private async garantirCodigoErpLivre(
    tx: TenantTx,
    empresaId: string,
    codigoErp: string,
    idAtual?: string,
  ) {
    const emUso = await tx.regraDesconto.findFirst({
      where: {
        empresaId,
        codigoErp,
        deletedAt: null,
        ...(idAtual ? { NOT: { id: idAtual } } : {}),
      },
      select: { id: true },
    });
    if (emUso) {
      throw new ConflictException(
        `Já existe uma regra com o código ERP '${codigoErp}'`,
      );
    }
  }

  /**
   * A regra que veio do ERP (tem `chave`) é do ERP: ele reenvia e sobrescreve, e
   * mexer aqui criaria uma divergência que a próxima carga desfaz. A tela só
   * edita e exclui o que nasceu nela (decisão do usuário em 06/11/2026).
   */
  private exigirRegraDaTela(regra: { chave: string | null }) {
    if (regra.chave) {
      throw new ForbiddenException(
        'Esta regra vem do ERP e só pode ser alterada lá. A tela edita apenas as regras criadas nela.',
      );
    }
  }

  /** Quantos vínculos vivos apontam para a regra (categoria, produto, item de tabela). */
  private async usos(tx: TenantTx, empresaId: string, id: string) {
    const viva = { regraDescontoId: id, empresaId, deletedAt: null };
    const [categorias, produtos, itens] = await Promise.all([
      tx.categoria.count({ where: viva }),
      tx.produto.count({ where: viva }),
      tx.tabelaPrecoItem.count({ where: viva }),
    ]);
    return { categorias, produtos, itens, total: categorias + produtos + itens };
  }

  findAll(empresaId: string, query: RegraDescontoQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.padrao !== undefined ? { padrao: query.padrao } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  descricao: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  codigoErp: {
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
          : 'descricao';
      const [data, total] = await Promise.all([
        tx.regraDesconto.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.regraDesconto.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const regra = await tx.regraDesconto.findFirst({
        where: { id, empresaId, deletedAt: null },
        include: INCLUDE,
      });
      if (!regra)
        throw new NotFoundException('Regra de desconto não encontrada');
      return regra;
    });
  }

  create(
    empresaId: string,
    user: AuthenticatedUser,
    input: RegraDescontoCreate,
  ) {
    const { faixas, codigoErp, ...header } = input;
    this.validarFaixas(faixas);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const codigo = codigoErp?.trim() || null;
      if (codigo) await this.garantirCodigoErpLivre(tx, empresaId, codigo);
      if (header.padrao) await this.garantirPadraoUnico(tx, empresaId);

      return tx.regraDesconto.create({
        data: {
          ...header,
          codigoErp: codigo,
          empresaId,
          createdBy: user.id,
          updatedBy: user.id,
          faixas: {
            create: faixas.map((f) => ({
              ...f,
              empresaId,
              createdBy: user.id,
              updatedBy: user.id,
            })),
          },
        },
        include: INCLUDE,
      });
    });
  }

  async update(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    input: RegraDescontoUpdate,
  ) {
    const { faixas, codigoErp, ...header } = input;
    if (faixas) this.validarFaixas(faixas);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const regra = await tx.regraDesconto.findFirst({
        where: { id, empresaId, deletedAt: null },
        select: { id: true, chave: true, padrao: true, codigoErp: true },
      });
      if (!regra)
        throw new NotFoundException('Regra de desconto não encontrada');
      this.exigirRegraDaTela(regra);

      // Sem regra padrão a empresa fica sem o desconto/comissão de referência:
      // a padrão não deixa de ser padrão nem é desativada — marca-se outra.
      if (regra.padrao && (header.padrao === false || header.ativo === false)) {
        throw new ConflictException(
          'Esta é a regra padrão. Marque outra regra como padrão antes de desmarcar ou desativar esta.',
        );
      }

      const codigo =
        codigoErp !== undefined ? codigoErp?.trim() || null : undefined;
      // O código é a ligação com o que já usa a regra: trocá-lo com vínculos
      // vivos desfaria a correspondência com o ERP.
      if (codigo !== undefined && codigo !== (regra.codigoErp ?? null)) {
        const u = await this.usos(tx, empresaId, id);
        if (u.total > 0) {
          throw new ConflictException(
            `O código não pode mudar: ${u.categorias} categoria(s), ${u.produtos} produto(s) e ${u.itens} item(ns) de tabela de preço usam esta regra.`,
          );
        }
      }
      if (codigo) await this.garantirCodigoErpLivre(tx, empresaId, codigo, id);
      if (header.padrao) await this.garantirPadraoUnico(tx, empresaId, id);

      // Faixas informadas substituem o conjunto inteiro (mesmo contrato dos
      // itens de orçamento); ausentes, ficam como estão.
      if (faixas) {
        await tx.regraDescontoFaixa.deleteMany({
          where: { regraDescontoId: id, empresaId },
        });
      }

      return tx.regraDesconto.update({
        where: { id },
        data: {
          ...header,
          ...(codigo !== undefined ? { codigoErp: codigo } : {}),
          updatedBy: user.id,
          ...(faixas
            ? {
                faixas: {
                  create: faixas.map((f) => ({
                    ...f,
                    empresaId,
                    createdBy: user.id,
                    updatedBy: user.id,
                  })),
                },
              }
            : {}),
        },
        include: INCLUDE,
      });
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const regra = await tx.regraDesconto.findFirst({
        where: { id, empresaId, deletedAt: null },
        select: { id: true, chave: true, padrao: true },
      });
      if (!regra)
        throw new NotFoundException('Regra de desconto não encontrada');
      this.exigirRegraDaTela(regra);

      if (regra.padrao) {
        throw new ConflictException(
          'Esta é a regra padrão. Marque outra regra como padrão antes de excluir esta.',
        );
      }

      // Regra apontada por categoria, produto ou item de tabela de preço não sai:
      // o vínculo ficaria sem regra e o desconto/comissão cairia no padrão em silêncio.
      const u = await this.usos(tx, empresaId, id);
      if (u.total > 0) {
        throw new ConflictException(
          `Regra em uso: ${u.categorias} categoria(s), ${u.produtos} produto(s) e ${u.itens} item(ns) de tabela de preço apontam para ela. Troque a regra deles antes de excluir.`,
        );
      }

      await tx.regraDesconto.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedBy: user.id,
          ativo: false,
          padrao: false,
        },
      });
      return { success: true };
    });
  }
}
