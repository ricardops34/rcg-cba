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
import type {
  ProdutoRelacionado,
  ProdutoRelacionadoCriar,
} from '@plataforma/contracts';

/**
 * Similares e aplicação — o que um produto tem a ver com outro.
 *
 * Nada disto vem do ERP: é conhecimento de quem vende, e por isso vive em
 * tabela própria, como os campos complementares e as fotos.
 */
@Injectable()
export class ProdutoRelacionadosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * As relações do produto, **dos dois lados**.
   *
   * Ler só as que partem daqui esconderia metade do cadastro: quem abre o
   * químico não veria em que dosadora ele é usado, e quem cadastrou o similar
   * de A precisaria cadastrar de novo em B. É por isso que a leitura junta as
   * duas pontas e marca cada uma com `origem`.
   */
  async listar(
    empresaId: string,
    produtoId: string,
  ): Promise<ProdutoRelacionado[]> {
    return this.prisma.withTenant(empresaId, (tx) =>
      this.listarTx(tx, empresaId, produtoId),
    );
  }

  /** Mesma leitura, para quem já está dentro de uma transação. */
  async listarTx(
    tx: TenantTx,
    empresaId: string,
    produtoId: string,
  ): Promise<ProdutoRelacionado[]> {
    const selecao = {
      id: true,
      codigoErp: true,
      descricao: true,
      unidade: true,
      ativo: true,
    };

    const [saindo, chegando] = await Promise.all([
      tx.produtoRelacionado.findMany({
        where: { empresaId, produtoId },
        include: { relacionado: { select: selecao } },
        orderBy: [{ tipo: 'asc' }, { ordem: 'asc' }],
      }),
      tx.produtoRelacionado.findMany({
        where: { empresaId, relacionadoId: produtoId },
        include: { produto: { select: selecao } },
        orderBy: [{ tipo: 'asc' }, { ordem: 'asc' }],
      }),
    ]);

    return [
      ...saindo.map((r) => ({
        id: r.id,
        tipo: r.tipo,
        origem: true,
        observacao: r.observacao,
        ordem: r.ordem,
        produtoId: r.relacionado.id,
        codigoErp: r.relacionado.codigoErp,
        descricao: r.relacionado.descricao,
        unidade: r.relacionado.unidade,
        ativo: r.relacionado.ativo,
      })),
      ...chegando.map((r) => ({
        id: r.id,
        tipo: r.tipo,
        origem: false,
        observacao: r.observacao,
        ordem: r.ordem,
        produtoId: r.produto.id,
        codigoErp: r.produto.codigoErp,
        descricao: r.produto.descricao,
        unidade: r.produto.unidade,
        ativo: r.produto.ativo,
      })),
    ];
  }

  async criar(
    empresaId: string,
    userId: string,
    produtoId: string,
    input: ProdutoRelacionadoCriar,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      if (produtoId === input.relacionadoId) {
        throw new BadRequestException(
          'Um produto não se relaciona com ele mesmo',
        );
      }

      const produtos = await tx.produto.findMany({
        where: {
          empresaId,
          id: { in: [produtoId, input.relacionadoId] },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (produtos.length !== 2) {
        throw new NotFoundException('Produto não encontrado');
      }

      // O similar é simétrico e a leitura já olha os dois lados, então gravar
      // A→B quando B→A existe criaria duas linhas para o mesmo fato — e a
      // tela mostraria o mesmo produto duas vezes.
      const inverso =
        input.tipo === 'similar'
          ? await tx.produtoRelacionado.findFirst({
              where: {
                empresaId,
                produtoId: input.relacionadoId,
                relacionadoId: produtoId,
                tipo: 'similar',
              },
              select: { id: true },
            })
          : null;
      if (inverso) {
        throw new ConflictException('Estes produtos já são similares');
      }

      try {
        return await tx.produtoRelacionado.create({
          data: {
            empresaId,
            produtoId,
            relacionadoId: input.relacionadoId,
            tipo: input.tipo,
            observacao: input.observacao || null,
            ordem: input.ordem,
            createdBy: userId,
            updatedBy: userId,
          },
        });
      } catch {
        // A única violação possível aqui é a chave única da relação.
        throw new ConflictException('Esta relação já existe');
      }
    });
  }

  /**
   * Aceita remover pela ponta que estiver aberta na tela.
   *
   * Quem vê "usado em" está vendo uma relação cadastrada do outro lado; exigir
   * que ele fosse até o outro produto para desfazê-la seria uma pegadinha.
   */
  async remover(empresaId: string, produtoId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const relacao = await tx.produtoRelacionado.findFirst({
        where: {
          id,
          empresaId,
          OR: [{ produtoId }, { relacionadoId: produtoId }],
        },
        select: { id: true },
      });
      if (!relacao) throw new NotFoundException('Relação não encontrada');
      await tx.produtoRelacionado.delete({ where: { id } });
      return { ok: true };
    });
  }
}
