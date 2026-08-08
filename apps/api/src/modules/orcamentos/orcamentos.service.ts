import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import {
  combinarFiltroVendedor,
  resolverEscopoVendedores,
  type EscopoVendedores,
} from '../../common/escopo/escopo-vendedores';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  OrcamentoCreate,
  OrcamentoQuery,
  OrcamentoUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { criarAtividadeRetorno } from './criar-atividade-retorno';
import { calcularItensOrcamento } from './calcular-itens-orcamento';
import { proximoNumeroOrcamento } from './proximo-numero-orcamento';
import { resolverTabelaPrecoCliente } from '../../common/precos/resolver-tabela-preco-cliente';
import { resolverRegrasDescontoDosItens } from '../../common/precos/resolver-regra-desconto-item';
import {
  ocultarComissaoDosItens,
  podeVerComissao,
} from '../../common/permissoes/pode-ver-comissao';

const SORT_FIELDS = new Set([
  'numero',
  'titulo',
  'status',
  'vlrTotal',
  'dataValidade',
  'ativo',
  'createdAt',
]);

/** Termo de busca como Nº de orçamento, ou null se não for um int válido. */
function numeroDeBusca(search: string): number | null {
  if (!/^\d+$/.test(search.trim())) return null;
  const n = Number(search.trim());
  return n > 0 && n <= 2147483647 ? n : null;
}

const CLIENTE_SELECT = {
  select: { id: true, razaoSocial: true, nomeFantasia: true },
};
const VENDEDOR_SELECT = {
  // email/telefone saem no cabeçalho da proposta em PDF (contato do vendedor).
  select: {
    id: true,
    nome: true,
    nomeReduzido: true,
    email: true,
    telefone: true,
  },
};
const OPORTUNIDADE_SELECT = { select: { id: true, titulo: true } };
const CONDICAO_PAGAMENTO_SELECT = { select: { id: true, descricao: true } };
const PRODUTO_SELECT = {
  select: { id: true, codigoErp: true, descricao: true, unidade: true },
};
const INCLUDE = {
  cliente: CLIENTE_SELECT,
  vendedor: VENDEDOR_SELECT,
  oportunidade: OPORTUNIDADE_SELECT,
  condicaoPagamento: CONDICAO_PAGAMENTO_SELECT,
  itens: {
    include: {
      produto: PRODUTO_SELECT,
      regraDesconto: { select: { id: true, codigoErp: true, descricao: true } },
    },
  },
};

@Injectable()
export class OrcamentosService {
  constructor(private readonly prisma: PrismaService) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  private garantirVendedorNoEscopo(
    escopo: EscopoVendedores,
    vendedorId: string,
  ) {
    if (escopo !== null && !escopo.includes(vendedorId)) {
      throw new NotFoundException('Vendedor fora do seu escopo');
    }
  }

  private async garantirClienteNoEscopo(
    tx: TenantTx,
    empresaId: string,
    escopo: EscopoVendedores,
    clienteId: string,
  ) {
    const cliente = await tx.cliente.findFirst({
      where: { id: clienteId, empresaId, deletedAt: null },
      select: { vendedorId: true },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    if (
      escopo !== null &&
      (!cliente.vendedorId || !escopo.includes(cliente.vendedorId))
    ) {
      throw new NotFoundException('Cliente fora do seu escopo');
    }
  }

  private async garantirOportunidadeNoEscopo(
    tx: TenantTx,
    empresaId: string,
    escopo: EscopoVendedores,
    oportunidadeId: string,
  ) {
    const oportunidade = await tx.oportunidade.findFirst({
      where: { id: oportunidadeId, empresaId, deletedAt: null },
      select: { vendedorId: true },
    });
    if (!oportunidade)
      throw new NotFoundException('Oportunidade não encontrada');
    if (escopo !== null && !escopo.includes(oportunidade.vendedorId)) {
      throw new NotFoundException('Oportunidade fora do seu escopo');
    }
  }

  /**
   * Preço/estoque de um produto pra um cliente específico — alimenta o
   * pré-preenchimento de vlrUnitario ao adicionar um item no form de
   * orçamento (vlrTabela da Tabela de Preço vinculada ao cliente, com
   * ultimoPreco do produto como fallback informativo quando não há
   * tabela/preço cadastrado) e a coluna "Estoque" (saldo somado em todos os
   * armazéns). Usa a permissão de orcamentos, não a de estoque — é só
   * informativo dentro do form, não a tela de Estoque em si.
   */
  async precoProduto(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
    produtoId: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      await this.garantirClienteNoEscopo(tx, empresaId, escopo, clienteId);

      const tabelaPrecoId = await resolverTabelaPrecoCliente(
        tx,
        empresaId,
        clienteId,
      );
      const [tabelaItem, produto, estoque] = await Promise.all([
        tabelaPrecoId
          ? tx.tabelaPrecoItem.findFirst({
              where: {
                tabelaPrecoId,
                produtoId,
                deletedAt: null,
              },
              select: { preco: true },
            })
          : Promise.resolve(null),
        tx.produto.findFirst({
          where: { id: produtoId, empresaId },
          select: { ultimoPreco: true },
        }),
        tx.estoque.aggregate({
          where: { empresaId, produtoId, deletedAt: null },
          _sum: { saldo: true },
        }),
      ]);
      // Regra aplicável ao item, pra tela avisar em tempo real quando o
      // desconto passa do limite e mostrar a prévia da comissão — o valor
      // gravado é sempre o que o servidor recalcula ao salvar.
      const regras = await resolverRegrasDescontoDosItens(
        tx,
        empresaId,
        [produtoId],
        tabelaPrecoId,
      );

      // Os limites de desconto todo mundo vê (alimentam o aviso na tela); as
      // faixas saem do payload de quem não pode ver comissão, porque é delas
      // que a prévia é calculada.
      const regra = regras.get(produtoId) ?? null;
      return {
        vlrTabela: tabelaItem?.preco ?? null,
        ultimoPreco: produto?.ultimoPreco ?? null,
        saldoEstoque: estoque._sum.saldo ?? 0,
        regraDesconto:
          regra && !podeVerComissao(user) ? { ...regra, faixas: [] } : regra,
      };
    });
  }

  findAll(empresaId: string, user: AuthenticatedUser, query: OrcamentoQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const numeroBuscado = query.search ? numeroDeBusca(query.search) : null;
      const where = {
        empresaId,
        deletedAt: null,
        ...combinarFiltroVendedor(escopo, query.vendedorId),
        ...(query.clienteId ? { clienteId: query.clienteId } : {}),
        ...(query.oportunidadeId
          ? { oportunidadeId: query.oportunidadeId }
          : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  titulo: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                // Termo só de dígitos também procura pelo Nº do orçamento —
                // é por ele que o cliente cobra o vendedor.
                ...(numeroBuscado !== null ? [{ numero: numeroBuscado }] : []),
              ],
            }
          : {}),
        ...(query.dataInicio || query.dataFim
          ? {
              createdAt: {
                ...(query.dataInicio ? { gte: query.dataInicio } : {}),
                ...(query.dataFim ? { lte: query.dataFim } : {}),
              },
            }
          : {}),
      };
      const sortField =
        query.sortBy && SORT_FIELDS.has(query.sortBy)
          ? query.sortBy
          : 'createdAt';
      const [data, total] = await Promise.all([
        tx.orcamento.findMany({
          where,
          include: INCLUDE,
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.orcamento.count({ where }),
      ]);
      return buildPaginatedResult(
        data.map((o) => ocultarComissaoDosItens(o, user)),
        total,
        query,
      );
    });
  }

  async findOne(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const orcamento = await tx.orcamento.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
        include: INCLUDE,
      });
      if (!orcamento) throw new NotFoundException('Orçamento não encontrado');
      return ocultarComissaoDosItens(orcamento, user);
    });
  }

  create(empresaId: string, user: AuthenticatedUser, input: OrcamentoCreate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      this.garantirVendedorNoEscopo(escopo, input.vendedorId);
      await this.garantirClienteNoEscopo(
        tx,
        empresaId,
        escopo,
        input.clienteId,
      );
      if (input.oportunidadeId) {
        await this.garantirOportunidadeNoEscopo(
          tx,
          empresaId,
          escopo,
          input.oportunidadeId,
        );
      }

      const { itens, ...header } = input;
      const { data: itensData, vlrTotal } = await calcularItensOrcamento(
        tx,
        empresaId,
        input.clienteId,
        itens,
        input.vendedorId,
      );

      const orcamento = await tx.orcamento.create({
        data: {
          ...(this.limpar(header) as object),
          empresaId,
          numero: await proximoNumeroOrcamento(tx, empresaId),
          vlrTotal,
          createdBy: user.id,
          updatedBy: user.id,
          itens: { create: itensData },
        } as never,
        include: INCLUDE,
      });

      if (header.dataRetorno) {
        await criarAtividadeRetorno(tx, empresaId, user.id, {
          orcamentoId: orcamento.id,
          titulo: orcamento.titulo,
          clienteId: orcamento.clienteId,
          vendedorId: orcamento.vendedorId,
          oportunidadeId: orcamento.oportunidadeId,
          dataRetorno: header.dataRetorno,
        });
      }

      return ocultarComissaoDosItens(orcamento, user);
    });
  }

  async update(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    input: OrcamentoUpdate,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const orcamento = await tx.orcamento.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
      });
      if (!orcamento) throw new NotFoundException('Orçamento não encontrado');
      if (orcamento.status === 'aprovado') {
        throw new ConflictException('Orçamento aprovado não pode ser alterado');
      }
      // Vencido é registro histórico: não se altera nem se aprova ("efetiva").
      // O caminho para reaproveitá-lo é copiar, que gera um novo orçamento com
      // validade reiniciada.
      if (orcamento.status === 'expirado') {
        throw new ConflictException(
          'Orçamento vencido não pode ser alterado — faça uma cópia para gerar um novo',
        );
      }

      if (input.vendedorId)
        this.garantirVendedorNoEscopo(escopo, input.vendedorId);
      if (input.clienteId)
        await this.garantirClienteNoEscopo(
          tx,
          empresaId,
          escopo,
          input.clienteId,
        );
      if (input.oportunidadeId) {
        await this.garantirOportunidadeNoEscopo(
          tx,
          empresaId,
          escopo,
          input.oportunidadeId,
        );
      }

      const { itens, ...header } = input;
      let itensUpdate: Record<string, unknown> = {};
      if (itens) {
        await tx.orcamentoItem.deleteMany({ where: { orcamentoId: id } });
        const clienteId = input.clienteId ?? orcamento.clienteId;
        const { data: itensData, vlrTotal } = await calcularItensOrcamento(
          tx,
          empresaId,
          clienteId,
          itens,
          input.vendedorId ?? orcamento.vendedorId,
        );
        itensUpdate = { vlrTotal, itens: { create: itensData } };
      }

      const atualizado = await tx.orcamento.update({
        where: { id },
        data: {
          ...(this.limpar(header) as object),
          updatedBy: user.id,
          ...itensUpdate,
        } as never,
        include: INCLUDE,
      });

      const dataRetornoMudou =
        header.dataRetorno != null &&
        (!orcamento.dataRetorno ||
          header.dataRetorno.getTime() !== orcamento.dataRetorno.getTime());
      if (dataRetornoMudou) {
        await criarAtividadeRetorno(tx, empresaId, user.id, {
          orcamentoId: atualizado.id,
          titulo: atualizado.titulo,
          clienteId: atualizado.clienteId,
          vendedorId: atualizado.vendedorId,
          oportunidadeId: atualizado.oportunidadeId,
          dataRetorno: header.dataRetorno as Date,
        });
      }

      return ocultarComissaoDosItens(atualizado, user);
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const orcamento = await tx.orcamento.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
      });
      if (!orcamento) throw new NotFoundException('Orçamento não encontrado');
      return tx.orcamento.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
    });
  }
}
