import {
  BadRequestException,
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
  IntegracaoProduto,
  IntegracaoProdutoCreate,
  IntegracaoProdutoQuery,
  IntegracaoProdutoUpdate,
  IntegracaoProdutoLoteItem,
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
import {
  PARAMETRO_ARMAZEM_PADRAO,
  ParametrosService,
} from '../../parametros/parametros.service';

const INCLUDE = {
  categoria: { select: { chave: true } },
  subCategoria: { select: { chave: true } },
  armazem: { select: { chave: true } },
  regraDesconto: { select: { chave: true } },
  fabricante: {
    select: { chave: true, razaoSocial: true, nomeFantasia: true },
  },
} satisfies Prisma.ProdutoInclude;
type ProdutoComRelacoes = Prisma.ProdutoGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class IntegracaoProdutosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
  ) {}

  private paraLeitura(row: ProdutoComRelacoes): IntegracaoProduto {
    return {
      id: row.id,
      chave: row.chave ?? '',
      codigoErp: row.codigoErp,
      descricao: row.descricao,
      unidade: row.unidade,
      categoriaChave: row.categoria?.chave ?? null,
      subCategoriaChave: row.subCategoria?.chave ?? null,
      armazemChave: row.armazem?.chave ?? null,
      fabricanteChave: row.fabricante?.chave ?? null,
      codigoFabricante: row.codigoFabricante ?? null,
      descricaoFabricante: row.descricaoFabricante ?? null,
      dadosTecnicos: row.dadosTecnicos ?? null,
      marca: row.marca,
      codigoBarras: row.codigoBarras,
      codigoFornecedor: row.codigoFornecedor,
      ncm: row.ncm,
      qtdEmbalagem: row.qtdEmbalagem,
      peso: row.peso,
      ultimoPreco: row.ultimoPreco,
      observacao: row.observacao,
      regraDescontoChave: row.regraDesconto?.chave ?? null,
      ativo: row.ativo,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
    };
  }

  findAll(empresaId: string, query: IntegracaoProdutoQuery) {
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
        tx.produto.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { chave: 'asc' },
        }),
        tx.produto.count({ where }),
      ]);
      return buildPaginatedResult(
        data.map((r) => this.paraLeitura(r)),
        total,
        query,
      );
    });
  }

  async findOne(empresaId: string, chave: string): Promise<IntegracaoProduto> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const row = await tx.produto.findFirst({
        where: { empresaId, chave, deletedAt: null },
        include: INCLUDE,
      });
      if (!row) throw new NotFoundException('Produto não encontrado');
      return this.paraLeitura(row);
    });
  }

  async create(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoProdutoCreate,
  ): Promise<IntegracaoProduto> {
    const { registro } = await this.upsert(empresaId, apiKeyId, input);
    return registro;
  }

  /**
   * O mesmo upsert do `create`, devolvendo também **o que aconteceu**.
   */
  async upsert(
    empresaId: string,
    apiKeyId: string,
    input: IntegracaoProdutoCreate,
  ): Promise<{ registro: IntegracaoProduto; decisao: DecisaoUpsert }> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.produto.findFirst({
        where: { empresaId, chave: input.chave },
      });
      const decisao = decidirUpsert(existente);

      const categoriaId = await this.resolverCategoria(
        tx,
        empresaId,
        input.categoriaChave,
        'categoriaChave',
      );
      const subCategoriaId = await this.resolverCategoria(
        tx,
        empresaId,
        input.subCategoriaChave,
        'subCategoriaChave',
      );
      const armazemId = await this.resolverArmazemRecebido(
        tx,
        empresaId,
        input.armazemChave,
      );
      const fabricanteId = await this.resolverFabricante(
        tx,
        empresaId,
        input.fabricanteChave,
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
        unidade: input.unidade ?? null,
        categoriaId,
        subCategoriaId,
        armazemId,
        fabricanteId,
        codigoFabricante: input.codigoFabricante ?? null,
        descricaoFabricante: input.descricaoFabricante ?? null,
        dadosTecnicos: input.dadosTecnicos ?? null,
        marca: input.marca ?? null,
        codigoBarras: input.codigoBarras ?? null,
        codigoFornecedor: input.codigoFornecedor ?? null,
        ncm: input.ncm ?? null,
        qtdEmbalagem: input.qtdEmbalagem ?? null,
        peso: input.peso ?? null,
        ultimoPreco: input.ultimoPreco ?? null,
        observacao: input.observacao ?? null,
        regraDescontoId: regraDescontoId ?? null,
        ativo: input.ativo,
        updatedBy: autor,
      };

      if (decisao !== 'criar') {
        const atualizadoUpsert = await tx.produto.update({
          where: { id: existente!.id },
          data: { ...dados, ...camposDaDecisao(decisao) },
          include: INCLUDE,
        });
        return { registro: this.paraLeitura(atualizadoUpsert), decisao };
      }

      const criado = await tx.produto.create({
        data: { ...dados, empresaId, createdBy: autor },
        include: INCLUDE,
      });
      return { registro: this.paraLeitura(criado), decisao };
    });
  }

  upsertLote(
    empresaId: string,
    apiKeyId: string,
    registros: IntegracaoProdutoLoteItem[],
  ): Promise<IntegracaoLoteResultado> {
    return processarLote(registros, async (item) => {
      if (item.excluido) {
        await this.remove(empresaId, apiKeyId, item.chave);
        return 'excluido';
      }
      const { decisao } = await this.upsert(
        empresaId,
        apiKeyId,
        item as IntegracaoProdutoCreate,
      );
      return decisao === 'criar' ? 'criado' : 'atualizado';
    });
  }

  async update(
    empresaId: string,
    apiKeyId: string,
    chave: string,
    input: IntegracaoProdutoUpdate,
  ): Promise<IntegracaoProduto> {
    const autor = autorIntegracao(apiKeyId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      const existente = await tx.produto.findFirst({
        where: { empresaId, chave, deletedAt: null },
      });
      if (!existente) throw new NotFoundException('Produto não encontrado');

      const categoriaId =
        input.categoriaChave !== undefined
          ? await this.resolverCategoria(
              tx,
              empresaId,
              input.categoriaChave,
              'categoriaChave',
            )
          : undefined;
      const subCategoriaId =
        input.subCategoriaChave !== undefined
          ? await this.resolverCategoria(
              tx,
              empresaId,
              input.subCategoriaChave,
              'subCategoriaChave',
            )
          : undefined;
      const armazemId =
        input.armazemChave !== undefined
          ? await this.resolverArmazemRecebido(
              tx,
              empresaId,
              input.armazemChave,
            )
          : undefined;
      const fabricanteId =
        input.fabricanteChave !== undefined
          ? await this.resolverFabricante(tx, empresaId, input.fabricanteChave)
          : undefined;
      const regraDescontoId = await resolverRegraDesconto(
        tx,
        empresaId,
        input.regraDescontoChave,
      );

      const atualizado = await tx.produto.update({
        where: { id: existente.id },
        data: {
          ...(input.codigoErp !== undefined
            ? { codigoErp: input.codigoErp ?? '' }
            : {}),
          ...(input.descricao !== undefined
            ? { descricao: input.descricao }
            : {}),
          ...(input.unidade !== undefined ? { unidade: input.unidade } : {}),
          ...(categoriaId !== undefined ? { categoriaId } : {}),
          ...(subCategoriaId !== undefined ? { subCategoriaId } : {}),
          ...(armazemId !== undefined ? { armazemId } : {}),
          ...(fabricanteId !== undefined ? { fabricanteId } : {}),
          ...(input.codigoFabricante !== undefined
            ? { codigoFabricante: input.codigoFabricante }
            : {}),
          ...(input.descricaoFabricante !== undefined
            ? { descricaoFabricante: input.descricaoFabricante }
            : {}),
          ...(input.dadosTecnicos !== undefined
            ? { dadosTecnicos: input.dadosTecnicos }
            : {}),
          ...(regraDescontoId !== undefined ? { regraDescontoId } : {}),
          ...(input.marca !== undefined ? { marca: input.marca } : {}),
          ...(input.codigoBarras !== undefined
            ? { codigoBarras: input.codigoBarras }
            : {}),
          ...(input.codigoFornecedor !== undefined
            ? { codigoFornecedor: input.codigoFornecedor }
            : {}),
          ...(input.ncm !== undefined ? { ncm: input.ncm } : {}),
          ...(input.qtdEmbalagem !== undefined
            ? { qtdEmbalagem: input.qtdEmbalagem }
            : {}),
          ...(input.peso !== undefined ? { peso: input.peso } : {}),
          ...(input.ultimoPreco !== undefined
            ? { ultimoPreco: input.ultimoPreco }
            : {}),
          ...(input.observacao !== undefined
            ? { observacao: input.observacao }
            : {}),
          ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
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
      const existente = await tx.produto.findFirst({
        where: { empresaId, chave, deletedAt: null },
      });
      if (!existente) return;
      await tx.produto.update({
        where: { id: existente.id },
        data: { deletedAt: new Date(), deletedBy: autor, ativo: false },
      });
    });
  }

  private async resolverCategoria(
    tx: TenantTx,
    empresaId: string,
    codigo: string | null | undefined,
    campo: string,
  ) {
    if (!codigo) return null;
    const categoria = await tx.categoria.findFirst({
      where: { empresaId, chave: codigo, deletedAt: null },
      select: { id: true },
    });
    if (!categoria)
      throw new NotFoundException(`${campo} '${codigo}' não encontrado`);
    return categoria.id;
  }

  private async resolverArmazem(
    tx: TenantTx,
    empresaId: string,
    codigo: string | null | undefined,
  ) {
    if (!codigo) return null;
    const armazem = await tx.armazem.findFirst({
      where: { empresaId, chave: codigo, deletedAt: null },
      select: { id: true },
    });
    if (!armazem)
      throw new NotFoundException(`armazemChave '${codigo}' não encontrado`);
    return armazem.id;
  }

  /**
   * Valor informado pelo ERP tem prioridade. Ausência, null ou texto vazio
   * usa o ARMAZEM_PADRAO da empresa; se o parâmetro também estiver vazio, o
   * produto continua sem armazém associado.
   */
  private async resolverArmazemRecebido(
    tx: TenantTx,
    empresaId: string,
    informado: string | null | undefined,
  ) {
    const valorInformado = informado?.trim();
    // Integrações Protheus antigas concatenavam FILIAL + "-" + B1_LOCPAD.
    // Quando ambos estavam vazios, o resultado era apenas "-", que representa
    // ausência de armazém e deve acionar o fallback da empresa.
    const chaveInformada =
      valorInformado && !/^-+$/.test(valorInformado) ? valorInformado : null;
    const configurada = chaveInformada
      ? null
      : await this.parametros.obterTexto(
          empresaId,
          PARAMETRO_ARMAZEM_PADRAO,
          null,
          tx,
        );
    if (chaveInformada) {
      return this.resolverArmazem(tx, empresaId, chaveInformada);
    }

    const valorPadrao = configurada?.trim();
    if (!valorPadrao) return null;
    return this.resolverArmazemPadrao(tx, empresaId, valorPadrao);
  }

  /**
   * Na tela de parâmetros é comum o administrador conhecer apenas o código
   * do armazém (ex.: 01), não a chave composta da integração (ex.: -01).
   * A chave exata tem prioridade; codigoErp só é aceito quando identifica uma
   * única linha, para nunca escolher silenciosamente a filial errada.
   */
  private async resolverArmazemPadrao(
    tx: TenantTx,
    empresaId: string,
    valor: string,
  ) {
    const porChave = await tx.armazem.findFirst({
      where: { empresaId, chave: valor, deletedAt: null },
      select: { id: true },
    });
    if (porChave) return porChave.id;

    const porCodigoErp = await tx.armazem.findMany({
      where: { empresaId, codigoErp: valor, deletedAt: null },
      select: { id: true },
      take: 2,
    });
    if (porCodigoErp.length === 1) return porCodigoErp[0].id;
    if (porCodigoErp.length > 1) {
      throw new BadRequestException(
        `ARMAZEM_PADRAO '${valor}' corresponde a mais de um armazém; informe a chave de integração completa`,
      );
    }
    throw new NotFoundException(
      `ARMAZEM_PADRAO '${valor}' não encontrou armazém por chave nem por codigoErp`,
    );
  }

  private async resolverFabricante(
    tx: TenantTx,
    empresaId: string,
    codigo: string | null | undefined,
  ) {
    if (!codigo) return null;
    const fornecedor = await tx.fornecedor.findFirst({
      where: { empresaId, chave: codigo, deletedAt: null },
      select: { id: true },
    });
    // Fabricante é uma referência opcional do produto. O ERP pode enviar uma
    // chave cujo fornecedor ainda não foi sincronizado; isso não deve impedir
    // o cadastro do produto.
    return fornecedor?.id ?? null;
  }
}
