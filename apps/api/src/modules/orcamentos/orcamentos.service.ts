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
import type { OrigemVenda } from '@prisma/client';
import type {
  OrcamentoCreate,
  OrcamentoQuery,
  OrcamentoUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { criarAtividadeRetorno } from './criar-atividade-retorno';
import {
  orcamentoExigeAutorizacao,
  registrarAtividadeOrcamento,
} from './registrar-atividade-orcamento';
import { calcularItensOrcamento } from './calcular-itens-orcamento';
import { montarOrcamentoPdf } from './orcamento-pdf';
import { proximoNumeroOrcamento } from './proximo-numero-orcamento';
import { resolverTabelaPrecoCliente } from '../../common/precos/resolver-tabela-preco-cliente';
import { resolverRegrasDescontoDosItens } from '../../common/precos/resolver-regra-desconto-item';
import { ParametrosService } from '../parametros/parametros.service';
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
  select: {
    id: true,
    codigoErp: true,
    descricao: true,
    unidade: true,
    fotos: {
      select: { url: true, principal: true },
      orderBy: { principal: 'desc' as const },
    },
    exibirFotoOrcamento: true,
  },
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
  ) {}

  /** Parâmetro da empresa que esconde comissão de todos os perfis. */
  private comissaoOcultaParaTodos(empresaId: string) {
    return this.parametros.obterBoolean(
      empresaId,
      'COMISSAO_OCULTA_PARA_TODOS',
      false,
    );
  }

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

  /**
   * Quem originou a venda — o **executor**, não o dono da carteira.
   *
   * A venda continua sempre vinculada ao vendedor do cadastro do cliente (ver
   * `create`). Esta coluna responde a outra pergunta: quem de fato montou o
   * orçamento. Supervisor, gerente e administrador vendem na carteira do
   * subordinado, e sem o registro disso a comissão e a leitura de desempenho
   * tratam "o vendedor fez" e "o supervisor fez pelo vendedor" como iguais.
   *
   * A ordem da decisão importa: **ser o dono da carteira ganha do cargo**. Um
   * gerente com carteira própria, vendendo para cliente dele, é `vendedor` —
   * ali ele está atendendo, não cobrindo alguém.
   */
  private async origemDaVenda(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    vendedorDoCliente: string | null,
  ): Promise<OrigemVenda> {
    const vendedor = await tx.vendedor.findFirst({
      where: { usuarioId: user.id, empresaId, deletedAt: null },
      select: { id: true, tipo: true },
    });
    if (vendedor && vendedor.id === vendedorDoCliente) return 'vendedor';
    // `isAdmin` (Administrador e Diretor) vem **antes** do cargo do cadastro:
    // quem administra o sistema pode ter cadastro de vendedor como gerente —
    // é o caso de quem acumula as duas funções —, e nesse caso a venda que ele
    // faz na carteira alheia é da administração, não da gerência comercial.
    if (user.isAdmin) return 'administrador';
    if (vendedor?.tipo === 'superior') return 'superior';
    // Sem cadastro de vendedor (administrativo, financeiro) ou vendedor
    // mexendo em carteira que não é dele — o que só acontece com escopo que
    // permita, e aí quem responde é a administração.
    return 'administrador';
  }

  /**
   * Valida o cliente e devolve o vendedor cadastrado nele — que é também o
   * vendedor do orçamento (ver create/update), e não uma escolha de quem está
   * lançando.
   */
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
    return cliente.vendedorId;
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
          regra &&
          !podeVerComissao(user, await this.comissaoOcultaParaTodos(empresaId))
            ? { ...regra, faixas: [] }
            : regra,
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
        ...(query.origem ? { origem: query.origem } : {}),
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
      const oculta = await this.comissaoOcultaParaTodos(empresaId);
      return buildPaginatedResult(
        data.map((o) => ocultarComissaoDosItens(o, user, oculta)),
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
      return ocultarComissaoDosItens(
        orcamento,
        user,
        await this.comissaoOcultaParaTodos(empresaId),
      );
    });
  }

  create(empresaId: string, user: AuthenticatedUser, input: OrcamentoCreate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const vendedorDoCliente = await this.garantirClienteNoEscopo(
        tx,
        empresaId,
        escopo,
        input.clienteId,
      );
      // O vendedor do orçamento é o do cadastro do cliente — o que vier no
      // payload só vale se o cliente não tiver vendedor vinculado.
      const vendedorId = vendedorDoCliente ?? input.vendedorId;
      this.garantirVendedorNoEscopo(escopo, vendedorId);
      if (input.oportunidadeId) {
        await this.garantirOportunidadeNoEscopo(
          tx,
          empresaId,
          escopo,
          input.oportunidadeId,
        );
      }

      const origem = await this.origemDaVenda(
        tx,
        empresaId,
        user,
        vendedorDoCliente,
      );
      const { itens, ...header } = { ...input, vendedorId, origem };
      const { data: itensData, vlrTotal } = await calcularItensOrcamento(
        tx,
        empresaId,
        input.clienteId,
        itens,
        vendedorId,
        await this.parametros.obterBoolean(
          empresaId,
          'DESCONTO_ACIMA_LIMITE_BLOQUEIA',
          false,
        ),
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

      // Cadastrar já aprovado passa pela mesma trava da efetivação.
      if (
        orcamento.status === 'aprovado' &&
        (await orcamentoExigeAutorizacao(tx, orcamento.id))
      ) {
        throw new ConflictException(
          'Orçamento com desconto igual ou acima do máximo da regra — ' +
            'solicite a autorização de desconto antes de efetivar',
        );
      }

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

      await registrarAtividadeOrcamento(tx, empresaId, user.id, 'criacao', {
        id: orcamento.id,
        numero: orcamento.numero,
        titulo: orcamento.titulo,
        clienteId: orcamento.clienteId,
        vendedorId: orcamento.vendedorId,
        oportunidadeId: orcamento.oportunidadeId,
      });

      return ocultarComissaoDosItens(
        orcamento,
        user,
        await this.comissaoOcultaParaTodos(empresaId),
      );
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

      let vendedorDoCliente: string | null = null;
      if (input.clienteId)
        vendedorDoCliente = await this.garantirClienteNoEscopo(
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

      // O vendedor não se troca por edição: ele acompanha o cliente. Trocar o
      // cliente traz junto o vendedor do novo cadastro; sem troca de cliente,
      // fica o que já estava gravado, mesmo que o payload traga outro.
      const clienteTrocado =
        !!input.clienteId && input.clienteId !== orcamento.clienteId;
      const vendedorId =
        clienteTrocado && vendedorDoCliente
          ? vendedorDoCliente
          : orcamento.vendedorId;
      this.garantirVendedorNoEscopo(escopo, vendedorId);

      const { itens, ...header } = { ...input, vendedorId };
      let itensUpdate: Record<string, unknown> = {};
      if (itens) {
        await tx.orcamentoItem.deleteMany({ where: { orcamentoId: id } });
        const clienteId = input.clienteId ?? orcamento.clienteId;
        const { data: itensData, vlrTotal } = await calcularItensOrcamento(
          tx,
          empresaId,
          clienteId,
          itens,
          vendedorId,
          await this.parametros.obterBoolean(
            empresaId,
            'DESCONTO_ACIMA_LIMITE_BLOQUEIA',
            false,
          ),
        );
        itensUpdate = {
          vlrTotal,
          itens: { create: itensData },
          // Mexeu nos itens, a autorização de desconto anterior não vale mais:
          // ela foi dada para aqueles preços. Volta à estaca zero, e o vendedor
          // solicita de novo se o novo desconto ainda passar do máximo.
          descontoSolicitadoEm: null,
          descontoSolicitadoPor: null,
          descontoAutorizadoEm: null,
          descontoAutorizadoPor: null,
        };
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

      // Efetivar (aprovar) exige autorização quando alguma linha bateu ou
      // passou o máximo da regra. A checagem é feita depois da gravação dos
      // itens — é o orçamento como ficou que vale — e a exceção desfaz a
      // transação inteira.
      if (
        header.status === 'aprovado' &&
        !atualizado.descontoAutorizadoEm &&
        (await orcamentoExigeAutorizacao(tx, id))
      ) {
        throw new ConflictException(
          'Orçamento com desconto igual ou acima do máximo da regra — ' +
            'solicite a autorização de desconto antes de efetivar',
        );
      }

      const paraAtividade = {
        id: atualizado.id,
        numero: atualizado.numero,
        titulo: atualizado.titulo,
        clienteId: atualizado.clienteId,
        vendedorId: atualizado.vendedorId,
        oportunidadeId: atualizado.oportunidadeId,
      };
      // Toda gravação vira registro no histórico do cliente; a resposta do
      // cliente (aprovou/recusou) entra como evento próprio, e não como mais
      // uma alteração.
      // Chegar aqui com o status anterior 'aprovado' é impossível (a guarda
      // no topo já recusou), então virar 'aprovado' é sempre transição nova.
      if (header.status === 'aprovado') {
        await registrarAtividadeOrcamento(
          tx,
          empresaId,
          user.id,
          'aprovacao_cliente',
          paraAtividade,
        );
      } else if (
        header.status === 'recusado' &&
        orcamento.status !== 'recusado'
      ) {
        await registrarAtividadeOrcamento(
          tx,
          empresaId,
          user.id,
          'recusa_cliente',
          paraAtividade,
        );
      } else {
        await registrarAtividadeOrcamento(
          tx,
          empresaId,
          user.id,
          'alteracao',
          paraAtividade,
        );
      }

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

      return ocultarComissaoDosItens(
        atualizado,
        user,
        await this.comissaoOcultaParaTodos(empresaId),
      );
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

  /** Orçamento dentro do escopo do usuário, com o que as ações abaixo usam. */
  private async buscarParaAcao(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
  ) {
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
    return orcamento;
  }

  /**
   * Primeira etapa da autorização de desconto: o vendedor pede a liberação.
   * Gera a pendência na agenda do supervisor (ver
   * registrarAtividadeOrcamento) e deixa o orçamento em "aguardando
   * autorização" — o PDF e a efetivação continuam travados até alguém
   * autorizar.
   */
  async solicitarAutorizacaoDesconto(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const orcamento = await this.buscarParaAcao(tx, empresaId, user, id);
      if (orcamento.descontoAutorizadoEm) {
        throw new ConflictException(
          'O desconto deste orçamento já está autorizado',
        );
      }
      if (!(await orcamentoExigeAutorizacao(tx, id))) {
        throw new ConflictException(
          'Nenhum item deste orçamento tem desconto igual ou acima do máximo da regra',
        );
      }

      const atualizado = await tx.orcamento.update({
        where: { id },
        data: {
          descontoSolicitadoEm: new Date(),
          descontoSolicitadoPor: user.id,
          updatedBy: user.id,
        },
        include: INCLUDE,
      });
      await registrarAtividadeOrcamento(
        tx,
        empresaId,
        user.id,
        'autorizacao_solicitada',
        atualizado,
        `Desconto acima do máximo da regra no orçamento "${atualizado.titulo}" — aguardando autorização.`,
      );
      return ocultarComissaoDosItens(
        atualizado,
        user,
        await this.comissaoOcultaParaTodos(empresaId),
      );
    });
  }

  /**
   * Segunda etapa: quem tem permissão de aprovar libera o desconto. A partir
   * daqui a proposta em PDF e a efetivação voltam a funcionar — até que os
   * itens mudem, o que derruba a autorização (ver update).
   */
  async autorizarDesconto(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const orcamento = await this.buscarParaAcao(tx, empresaId, user, id);
      if (orcamento.descontoAutorizadoEm) {
        throw new ConflictException(
          'O desconto deste orçamento já está autorizado',
        );
      }
      if (!(await orcamentoExigeAutorizacao(tx, id))) {
        throw new ConflictException(
          'Nenhum item deste orçamento tem desconto igual ou acima do máximo da regra',
        );
      }

      const atualizado = await tx.orcamento.update({
        where: { id },
        data: {
          descontoAutorizadoEm: new Date(),
          descontoAutorizadoPor: user.id,
          updatedBy: user.id,
        },
        include: INCLUDE,
      });
      // Fecha a pendência aberta na solicitação: quem autorizou já resolveu a
      // tarefa, e ela não deve continuar na agenda do supervisor.
      await tx.atividade.updateMany({
        where: {
          orcamentoId: id,
          empresaId,
          concluida: false,
          titulo: { startsWith: 'Autorização de desconto solicitada' },
        },
        data: {
          concluida: true,
          dataConclusao: new Date(),
          updatedBy: user.id,
        },
      });
      await registrarAtividadeOrcamento(
        tx,
        empresaId,
        user.id,
        'autorizacao_concedida',
        atualizado,
        `Desconto acima do máximo liberado para o orçamento "${atualizado.titulo}".`,
      );
      return ocultarComissaoDosItens(
        atualizado,
        user,
        await this.comissaoOcultaParaTodos(empresaId),
      );
    });
  }

  /**
   * Monta a proposta comercial em PDF e devolve os bytes do arquivo.
   *
   * Era gerada no navegador; veio para cá porque o envio pelo WhatsApp precisa
   * do arquivo existindo no servidor (ver `montarOrcamentoPdf`). A tela de
   * orçamento baixa desta mesma rota, então a proposta que o cliente recebe
   * pela conversa é a mesma que o vendedor imprime.
   *
   * A emissão fica registrada no histórico do orçamento/cliente, como antes —
   * `registrarPdf` existia só para isso e deixou de fazer sentido separada.
   *
   * `registrarEvento: false` é para quem já vai registrar a própria ação (o
   * envio pelo WhatsApp registra "proposta enviada", não "PDF gerado").
   */
  async gerarPdf(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    opcoes: { registrarEvento?: boolean } = {},
  ): Promise<{ conteudo: Buffer; nomeArquivo: string; numero: number }> {
    const dados = await this.prisma.withTenant(empresaId, async (tx) => {
      const basico = await this.buscarParaAcao(tx, empresaId, user, id);
      if (
        !basico.descontoAutorizadoEm &&
        (await orcamentoExigeAutorizacao(tx, id))
      ) {
        throw new ConflictException(
          'Orçamento com desconto igual ou acima do máximo da regra — ' +
            'solicite a autorização de desconto antes de gerar o PDF',
        );
      }

      const orcamento = await tx.orcamento.findFirstOrThrow({
        where: { id },
        include: INCLUDE,
      });
      // O orçamento traz só o resumo do cliente (razão social/fantasia); o
      // cabeçalho da proposta precisa do cadastro completo — documento,
      // endereço e contato.
      const cliente = await tx.cliente.findFirst({
        where: { id: orcamento.clienteId },
      });

      if (opcoes.registrarEvento !== false) {
        await registrarAtividadeOrcamento(
          tx,
          empresaId,
          user.id,
          'pdf',
          orcamento,
        );
      }
      return { orcamento, cliente };
    });

    // A empresa emitente não é tabela de tenant (não tem empresaId); é lida
    // fora da transação, com o mesmo critério da rota /empresas/ativa.
    const empresa = await this.prisma.empresa.findFirst({
      where: { id: empresaId, deletedAt: null },
    });

    const { orcamento, cliente } = dados;
    const conteudo = await montarOrcamentoPdf({
      numero: orcamento.numero,
      status: orcamento.status,
      createdAt: orcamento.createdAt,
      dataValidade: orcamento.dataValidade,
      dataRetorno: orcamento.dataRetorno,
      observacao: orcamento.observacao,
      // Decimal do Prisma não é number, e o gerador só formata número.
      vlrTotal: this.numeroOuNulo(orcamento.vlrTotal),
      cliente: {
        razaoSocial: cliente?.razaoSocial ?? orcamento.cliente.razaoSocial,
        nomeFantasia: cliente?.nomeFantasia ?? orcamento.cliente.nomeFantasia,
        cnpjCpf: cliente?.cnpjCpf,
        inscricaoEstadual: cliente?.inscricaoEstadual,
        endereco: cliente?.endereco,
        complemento: cliente?.complemento,
        bairro: cliente?.bairro,
        municipio: cliente?.municipio,
        uf: cliente?.uf,
        cep: cliente?.cep,
        contato: cliente?.contato,
        telefone: cliente?.telefone,
        celular: cliente?.celular,
        email: cliente?.email,
      },
      vendedor: orcamento.vendedor,
      condicaoPagamento: orcamento.condicaoPagamento,
      itens: orcamento.itens.map((i) => ({
        produto: i.produto,
        quantidade: this.numeroOuNulo(i.quantidade),
        vlrUnitario: this.numeroOuNulo(i.vlrUnitario),
        vlrTotal: this.numeroOuNulo(i.vlrTotal),
      })),
      empresa,
    });

    return {
      conteudo,
      nomeArquivo: `orcamento-${orcamento.numero}.pdf`,
      numero: orcamento.numero,
    };
  }

  /** Decimal/number/null do Prisma no formato que o gerador de PDF espera. */
  private numeroOuNulo(valor: unknown): number | null {
    if (valor == null) return null;
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }
}
