import { ajustarValidadeOrcamento } from './validade-orcamento';
import { ajustarRetornoOrcamento } from './retorno-orcamento';
import { diaLocal } from '../../common/horario/expediente';
import type {
  Prisma,
  SituacaoErpOrcamento,
  StatusOrcamento,
} from '@prisma/client';
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
  combinarFiltroVendedor,
  resolverEscopoVendedores,
  type EscopoVendedores,
} from '../../common/escopo/escopo-vendedores';
import {
  autorDoEvento,
  recorteDoSolicitante,
  type QuemPede,
} from '../../common/escopo/quem-pede';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type { OrigemVenda } from '@prisma/client';
import {
  numeroOrcamento,
  podeExcluirOrcamento,
  type OrcamentoCreate,
  type OrcamentoQuery,
  type OrcamentoUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { criarAtividadeRetorno } from './criar-atividade-retorno';
import {
  orcamentoExigeAutorizacao,
  registrarAtividadeOrcamento,
} from './registrar-atividade-orcamento';
import { calcularItensOrcamento } from './calcular-itens-orcamento';
import { resolverTabelaDoOrcamento } from './resolver-tabela-do-orcamento';
import { montarOrcamentoPdf } from './orcamento-pdf';
import { proximoNumeroOrcamento } from './proximo-numero-orcamento';
import {
  resolverTabelaPrecoCliente,
  resolverTabelaPrecoPorPraca,
} from '../../common/precos/resolver-tabela-preco-cliente';
import { resolverRegrasDescontoDosItens } from '../../common/precos/resolver-regra-desconto-item';
import {
  PARAMETRO_ORCAMENTO_ALTERA_TABELA_PRECO,
  PARAMETRO_ORCAMENTO_EXIBIR_FOTOS,
  ParametrosService,
} from '../parametros/parametros.service';
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

type Praca = { municipio?: string | null; uf?: string | null };

const MSG_SEM_CLIENTE_NAO_EFETIVA =
  'Orçamento de quem ainda não é cliente não pode ser aprovado — ' +
  'desmarque "Não é cliente (orçamento avulso)" e selecione o cliente no cadastro';

/** Os dados do interessado só existem sem cliente; com cliente, vão a nulo. */
const SEM_PROSPECT = {
  prospectNome: null,
  prospectDocumento: null,
  prospectTelefone: null,
  prospectEmail: null,
  prospectMunicipio: null,
  prospectUf: null,
};

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
   * tabela/preço cadastrado) e a coluna "Estoque": o **disponível** (SaldoSB2
   * do Protheus) somado nos armazéns de revenda — linha enviada antes de o ERP
   * mandar o disponível cai no saldo físico. Usa a permissão de orcamentos, não a de estoque — é só
   * informativo dentro do form, não a tela de Estoque em si.
   */
  /**
   * Tabela de preços que o orçamento do cliente começa usando (a do cadastro, com
   * o padrão de capital/interior) e se o vendedor pode trocá-la — o parâmetro
   * ORCAMENTO_ALTERA_TABELA_PRECO. Alimenta o campo da tela.
   */
  async tabelaPrecoDoCliente(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string | null,
    praca: Praca = {},
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      if (clienteId) {
        await this.garantirClienteNoEscopo(tx, empresaId, escopo, clienteId);
      }
      const tabelaPrecoId = clienteId
        ? await resolverTabelaPrecoCliente(tx, empresaId, clienteId)
        : await resolverTabelaPrecoPorPraca(tx, empresaId, praca);
      const podeAlterar =
      (await this.parametros.obterBoolean(
        empresaId,
        PARAMETRO_ORCAMENTO_ALTERA_TABELA_PRECO,
        false,
      )) ||
      !clienteId; // sem cliente (orçamento avulso), a tabela é livre
      const select = { id: true, descricao: true } as const;
      // As opções vêm daqui, e não de /tabelas-preco, porque aquela lista pede
      // permissão de cadastro, que o vendedor não tem.
      const [tabela, opcoes] = await Promise.all([
        tabelaPrecoId
          ? tx.tabelaPreco.findFirst({ where: { id: tabelaPrecoId, empresaId }, select })
          : null,
        podeAlterar
          ? tx.tabelaPreco.findMany({
              where: { empresaId, ativo: true, deletedAt: null },
              select,
              orderBy: { descricao: 'asc' },
            })
          : [],
      ]);
      return { tabelaPrecoId, tabela, podeAlterar, opcoes };
    });
  }

  async precoProduto(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string | null,
    produtoId: string,
    tabelaEscolhida?: string,
    praca: Praca = {},
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      if (clienteId) {
        await this.garantirClienteNoEscopo(tx, empresaId, escopo, clienteId);
      }

      const tabelaPrecoId = await resolverTabelaDoOrcamento(
        tx,
        empresaId,
        clienteId,
        tabelaEscolhida,
        (await this.parametros.obterBoolean(
          empresaId,
          PARAMETRO_ORCAMENTO_ALTERA_TABELA_PRECO,
          false,
        )) ||
        !clienteId, // sem cliente, a tabela é livre
        null,
        praca,
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
        tx.estoque.findMany({
          where: {
            empresaId,
            produtoId,
            deletedAt: null,
            armazem: { revenda: true },
          },
          select: { saldo: true, disponivel: true },
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
        saldoEstoque: estoque.reduce(
          (total, e) => total + (e.disponivel ?? e.saldo),
          0,
        ),
        regraDesconto:
          regra &&
          !podeVerComissao(user, await this.comissaoOcultaParaTodos(empresaId))
            ? { ...regra, faixas: [] }
            : regra,
      };
    });
  }

  /**
   * A situação do orçamento como o vendedor a enxerga, num filtro só:
   * - **aberto:** rascunho ou enviado, dentro da validade, ainda não faturado;
   * - **vencido:** expirado, ou aberto cuja validade já passou (a baixa de
   *   `expirado` pode demorar um dia para rodar);
   * - **faturado:** pedido faturado no ERP, total ou parcial.
   *
   * `situacaoErp` é nula até o ERP responder, e `NOT IN` descarta nulo no SQL —
   * por isso o "não faturado" é escrito como "nulo OU fora da lista".
   */
  private filtroSituacao(
    situacao: OrcamentoQuery['situacao'],
  ): Prisma.OrcamentoWhereInput | null {
    if (!situacao) return null;
    const hoje = new Date(`${diaLocal(new Date())}T00:00:00.000Z`);
    const faturados: SituacaoErpOrcamento[] = ['faturado', 'faturado_parcial'];
    const abertos: StatusOrcamento[] = ['rascunho', 'enviado'];
    if (situacao === 'faturado') return { situacaoErp: { in: faturados } };
    if (situacao === 'vencido') {
      return {
        OR: [
          { status: 'expirado' },
          { status: { in: abertos }, dataValidade: { lt: hoje } },
        ],
      };
    }
    return {
      AND: [
        { status: { in: abertos } },
        { OR: [{ dataValidade: null }, { dataValidade: { gte: hoje } }] },
        {
          OR: [{ situacaoErp: null }, { situacaoErp: { notIn: faturados } }],
        },
      ],
    };
  }

  findAll(
    empresaId: string,
    user: AuthenticatedUser,
    query: OrcamentoQuery,
    opcoes: { ignorarEscopo?: boolean } = {},
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      // `ignorarEscopo`: só o atendimento de WhatsApp fora da carteira usa
      // isto (`Vendedor.atendeOutrasCarteiras`).
      const escopo = opcoes.ignorarEscopo
        ? null
        : await resolverEscopoVendedores(tx, empresaId, user);
      const numeroBuscado = query.search ? numeroDeBusca(query.search) : null;
      const situacaoWhere = this.filtroSituacao(query.situacao);
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
                ...(numeroBuscado !== null
                  ? [
                      { numero: numeroBuscado },
                      // O Nº exibido é o do pedido no ERP, quando já existe.
                      { codigoErp: { contains: query.search?.trim() } },
                    ]
                  : []),
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
        ...(situacaoWhere ? { AND: [situacaoWhere] } : {}),
        ...(query.validadeInicio || query.validadeFim
          ? {
              dataValidade: {
                ...(query.validadeInicio ? { gte: query.validadeInicio } : {}),
                ...(query.validadeFim ? { lte: query.validadeFim } : {}),
              },
            }
          : {}),
        // Retorno agendado: o orçamento entra na agenda pelo dia em que o
        // vendedor deve retomar o contato, não pelo dia em que foi criado.
        ...(query.retornoInicio || query.retornoFim
          ? {
              dataRetorno: {
                ...(query.retornoInicio ? { gte: query.retornoInicio } : {}),
                ...(query.retornoFim ? { lte: query.retornoFim } : {}),
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

  async findOne(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    opcoes: { ignorarEscopo?: boolean } = {},
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = opcoes.ignorarEscopo
        ? null
        : await resolverEscopoVendedores(tx, empresaId, user);
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

  create(
    empresaId: string,
    user: AuthenticatedUser,
    input: OrcamentoCreate,
    opcoes: {
      ignorarEscopo?: boolean;
      /** Conversa de WhatsApp em que o orçamento está sendo montado: grava a origem. */
      conversaId?: string;
    } = {},
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      // `ignorarEscopo`: só o atendimento de WhatsApp fora da carteira usa
      // isto (`Vendedor.atendeOutrasCarteiras`) — cria o orçamento em nome do
      // cliente mesmo fora da hierarquia de quem está atendendo.
      const escopo = opcoes.ignorarEscopo
        ? null
        : await resolverEscopoVendedores(tx, empresaId, user);
      const clienteId = input.clienteId || null;
      if (!clienteId && input.status === 'aprovado') {
        throw new ConflictException(MSG_SEM_CLIENTE_NAO_EFETIVA);
      }
      const vendedorDoCliente = clienteId
        ? await this.garantirClienteNoEscopo(tx, empresaId, escopo, clienteId)
        : null;
      // O vendedor do orçamento é o do cadastro do cliente — o que vier no
      // payload só vale se o cliente não tiver vendedor vinculado (ou se não
      // houver cliente, que é o orçamento para quem ainda não o é).
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
        vendedorDoCliente ?? vendedorId,
      );
      const { itens, ...header } = {
        ...input,
        clienteId,
        ...(clienteId ? SEM_PROSPECT : {}),
        vendedorId,
        origem,
        ...(opcoes.conversaId
          ? { canalOrigem: 'whatsapp', conversaId: opcoes.conversaId }
          : {}),
      };
      header.dataValidade = await ajustarValidadeOrcamento(tx, empresaId, header.dataValidade);
      if (header.dataRetorno) {
        header.dataRetorno = await ajustarRetornoOrcamento(tx, empresaId, {
          retorno: header.dataRetorno,
          validade: header.dataValidade,
          vendedorUsuarioId: (
            await tx.vendedor.findUnique({
              where: { id: vendedorId },
              select: { usuarioId: true },
            })
          )?.usuarioId,
          autorId: user.id,
        });
      }
      const tabelaPrecoId = await resolverTabelaDoOrcamento(
        tx,
        empresaId,
        clienteId,
        input.tabelaPrecoId,
        (await this.parametros.obterBoolean(
          empresaId,
          PARAMETRO_ORCAMENTO_ALTERA_TABELA_PRECO,
          false,
        )) ||
        !clienteId, // sem cliente, a tabela é livre
        null,
        { municipio: input.prospectMunicipio, uf: input.prospectUf },
      );
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
        tabelaPrecoId,
      );

      const orcamento = await tx.orcamento.create({
        data: {
          ...(this.limpar(header) as object),
          tabelaPrecoId,
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

      // `clienteId` null no payload converte o orçamento em avulso (para quem
      // ainda não é cliente); ausente, o cliente gravado continua.
      const clienteId =
        input.clienteId !== undefined
          ? input.clienteId || null
          : orcamento.clienteId;
      const virouAvulso = input.clienteId === null || input.clienteId === '';
      if (
        !clienteId &&
        !(input.prospectNome ?? orcamento.prospectNome)?.trim()
      ) {
        throw new BadRequestException(
          'Selecione um cliente ou informe o nome do interessado',
        );
      }
      if (!clienteId && input.status === 'aprovado') {
        throw new ConflictException(MSG_SEM_CLIENTE_NAO_EFETIVA);
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
        (!!input.clienteId && input.clienteId !== orcamento.clienteId) ||
        virouAvulso;
      const vendedorId =
        clienteTrocado && vendedorDoCliente
          ? vendedorDoCliente
          : orcamento.vendedorId;
      this.garantirVendedorNoEscopo(escopo, vendedorId);

      const { itens, ...header } = {
        ...input,
        ...(input.clienteId !== undefined ? { clienteId } : {}),
        ...(clienteId ? SEM_PROSPECT : {}),
        vendedorId,
      };
      header.dataValidade = await ajustarValidadeOrcamento(tx, empresaId, header.dataValidade);
      // Retorno e validade se conferem sempre que um dos dois vem no payload:
      // mudar só a validade para antes do retorno gravado também é erro.
      if (header.dataRetorno || header.dataValidade) {
        const retorno = header.dataRetorno ?? orcamento.dataRetorno;
        if (retorno) {
          const ajustado = await ajustarRetornoOrcamento(tx, empresaId, {
            retorno,
            validade: header.dataValidade ?? orcamento.dataValidade,
            vendedorUsuarioId: (
              await tx.vendedor.findUnique({
                where: { id: vendedorId },
                select: { usuarioId: true },
              })
            )?.usuarioId,
            autorId: user.id,
          });
          // Só regrava o retorno que veio no payload; o que já estava gravado
          // é conferido, não reescrito.
          if (header.dataRetorno) header.dataRetorno = ajustado;
        }
      }
      // Tabela de preços: a gravada continua, salvo troca de cliente (volta à do
      // novo cliente) ou escolha nova — que só vale com o parâmetro ligado.
      const tabelaPrecoId = await resolverTabelaDoOrcamento(
        tx,
        empresaId,
        clienteId,
        clienteTrocado
          ? input.tabelaPrecoId
          : (input.tabelaPrecoId ?? orcamento.tabelaPrecoId),
        (await this.parametros.obterBoolean(
          empresaId,
          PARAMETRO_ORCAMENTO_ALTERA_TABELA_PRECO,
          false,
        )) ||
        !clienteId, // sem cliente, a tabela é livre
        clienteTrocado ? null : orcamento.tabelaPrecoId,
        {
          municipio: input.prospectMunicipio ?? orcamento.prospectMunicipio,
          uf: input.prospectUf ?? orcamento.prospectUf,
        },
      );
      let itensUpdate: Record<string, unknown> = {};
      if (itens) {
        await tx.orcamentoItem.deleteMany({ where: { orcamentoId: id } });
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
          tabelaPrecoId,
        );
        itensUpdate = {
          vlrTotal,
          itens: { create: itensData },
          // Mexeu nos itens, a autorização de desconto anterior não vale mais:
          // ela foi dada para aqueles preços. Volta à estaca zero, e o vendedor
          // solicita de novo se o novo desconto ainda passar do máximo.
          descontoSolicitadoEm: null,
          descontoSolicitadoPor: null,
          descontoSolicitacaoMotivo: null,
          descontoAutorizadoEm: null,
          descontoAutorizadoPor: null,
          descontoJustificativa: null,
        };
      }

      // Alterou o orçamento: o link que o cliente recebeu mostrava outra coisa.
      await tx.orcamentoLink.updateMany({
        where: { orcamentoId: id, revogadoEm: null },
        data: { revogadoEm: new Date() },
      });

      const atualizado = await tx.orcamento.update({
        where: { id },
        data: {
          ...(this.limpar(header) as object),
          tabelaPrecoId,
          updatedBy: user.id,
          ...itensUpdate,
          ...((header.status === 'aprovado' || header.status === 'recusado') &&
          header.status !== orcamento.status
            ? {
                clienteDecisao: header.status,
                clienteDecididoEm: new Date(),
                clienteDecisaoCanal: 'sistema',
                decididoPorUsuarioId: user.id,
              }
            : {}),
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
      // Só sem integração: não enviado ao ERP, ou recusado por ele. Com pedido
      // no ERP (ou a caminho dele), excluir perderia o acompanhamento.
      if (!podeExcluirOrcamento(orcamento)) {
        throw new ConflictException(
          'Orçamento integrado ao ERP não pode ser excluído. Só é possível excluir orçamento ainda não aprovado ou recusado pelo ERP.',
        );
      }
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
    quem: QuemPede,
    id: string,
  ) {
    // Usuário alcança a carteira dele; o cliente no WhatsApp alcança só os
    // orçamentos dele. As travas da ação (autorização de desconto pendente,
    // por exemplo) valem igual nos dois caminhos.
    const recorte = await recorteDoSolicitante(tx, empresaId, quem);
    const orcamento = await tx.orcamento.findFirst({
      where: {
        id,
        empresaId,
        deletedAt: null,
        ...(recorte.escopoVendedores
          ? { vendedorId: { in: recorte.escopoVendedores } }
          : {}),
        ...(recorte.clienteId ? { clienteId: recorte.clienteId } : {}),
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
    justificativa: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const orcamento = await this.buscarParaAcao(
        tx,
        empresaId,
        { tipo: 'usuario', user },
        id,
      );
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
          descontoSolicitacaoMotivo: justificativa,
          descontoRecusadoEm: null,
          descontoRecusadoPor: null,
          descontoRecusaMotivo: null,
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
        `Desconto acima do máximo da regra no orçamento "${atualizado.titulo}" — aguardando autorização. Justificativa do vendedor: ${justificativa}`,
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
    justificativa: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const orcamento = await this.buscarParaAcao(
        tx,
        empresaId,
        { tipo: 'usuario', user },
        id,
      );
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
          descontoJustificativa: justificativa,
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
        `Desconto acima do máximo liberado para o orçamento "${atualizado.titulo}". Justificativa: ${justificativa}`,
      );
      return ocultarComissaoDosItens(
        atualizado,
        user,
        await this.comissaoOcultaParaTodos(empresaId),
      );
    });
  }

  /**
   * O superior recusa o pedido de liberação, com o motivo. O pedido volta a
   * "não solicitado": o vendedor vê o motivo no orçamento, ajusta o desconto
   * (o que derruba qualquer liberação) ou pede de novo.
   */
  async recusarDesconto(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    justificativa: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const orcamento = await this.buscarParaAcao(
        tx,
        empresaId,
        { tipo: 'usuario', user },
        id,
      );
      if (orcamento.descontoAutorizadoEm) {
        throw new ConflictException(
          'O desconto deste orçamento já está autorizado',
        );
      }
      if (!orcamento.descontoSolicitadoEm) {
        throw new ConflictException(
          'Não há pedido de autorização de desconto para recusar',
        );
      }

      const atualizado = await tx.orcamento.update({
        where: { id },
        data: {
          descontoSolicitadoEm: null,
          descontoSolicitadoPor: null,
          descontoSolicitacaoMotivo: null,
          descontoRecusadoEm: new Date(),
          descontoRecusadoPor: user.id,
          descontoRecusaMotivo: justificativa,
          updatedBy: user.id,
        },
        include: INCLUDE,
      });
      // Fecha a pendência da agenda: a decisão já foi tomada.
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
        'autorizacao_recusada',
        atualizado,
        `Desconto recusado no orçamento "${atualizado.titulo}". Motivo: ${justificativa}`,
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
    quem: QuemPede,
    id: string,
    opcoes: { registrarEvento?: boolean } = {},
  ): Promise<{ conteudo: Buffer; nomeArquivo: string; numero: string }> {
    const dados = await this.prisma.withTenant(empresaId, async (tx) => {
      const basico = await this.buscarParaAcao(tx, empresaId, quem, id);
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
      const cliente = orcamento.clienteId
        ? await tx.cliente.findFirst({ where: { id: orcamento.clienteId } })
        : null;

      if (opcoes.registrarEvento !== false) {
        await registrarAtividadeOrcamento(
          tx,
          empresaId,
          autorDoEvento(quem),
          'pdf',
          orcamento,
        );
      }
      const exibirFotosProdutos = await this.parametros.obterBoolean(
        empresaId,
        PARAMETRO_ORCAMENTO_EXIBIR_FOTOS,
        true,
        tx,
      );
      return { orcamento, cliente, exibirFotosProdutos };
    });

    // A empresa emitente não é tabela de tenant (não tem empresaId); é lida
    // fora da transação, com o mesmo critério da rota /empresas/ativa.
    const empresa = await this.prisma.empresa.findFirst({
      where: { id: empresaId, deletedAt: null },
    });

    const { orcamento, cliente, exibirFotosProdutos } = dados;
    const numero = numeroOrcamento(orcamento);
    const conteudo = await montarOrcamentoPdf({
      numero,
      status: orcamento.status,
      createdAt: orcamento.createdAt,
      dataValidade: orcamento.dataValidade,
      dataRetorno: orcamento.dataRetorno,
      observacao: orcamento.observacao,
      // Decimal do Prisma não é number, e o gerador só formata número.
      vlrTotal: this.numeroOuNulo(orcamento.vlrTotal),
      // Sem cadastro, o cabeçalho sai com o que foi digitado no orçamento.
      cliente: {
        razaoSocial:
          cliente?.razaoSocial ??
          orcamento.cliente?.razaoSocial ??
          orcamento.prospectNome ??
          '',
        nomeFantasia:
          cliente?.nomeFantasia ?? orcamento.cliente?.nomeFantasia ?? null,
        cnpjCpf: cliente?.cnpjCpf ?? orcamento.prospectDocumento,
        inscricaoEstadual: cliente?.inscricaoEstadual,
        endereco: cliente?.endereco,
        complemento: cliente?.complemento,
        bairro: cliente?.bairro,
        municipio: cliente?.municipio ?? orcamento.prospectMunicipio,
        uf: cliente?.uf ?? orcamento.prospectUf,
        cep: cliente?.cep,
        contato: cliente?.contato,
        telefone: cliente?.telefone ?? orcamento.prospectTelefone,
        celular: cliente?.celular,
        email: cliente?.email ?? orcamento.prospectEmail,
      },
      vendedor: orcamento.vendedor,
      condicaoPagamento: orcamento.condicaoPagamento,
      itens: orcamento.itens.map((i) => ({
        produto: i.produto,
        quantidade: this.numeroOuNulo(i.quantidade),
        vlrUnitario: this.numeroOuNulo(i.vlrUnitario),
        vlrTotal: this.numeroOuNulo(i.vlrTotal),
      })),
      exibirFotosProdutos,
      empresa,
    });

    return {
      conteudo,
      nomeArquivo: `orcamento-${numero}.pdf`,
      numero,
    };
  }

  /** Decimal/number/null do Prisma no formato que o gerador de PDF espera. */
  private numeroOuNulo(valor: unknown): number | null {
    if (valor == null) return null;
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }
}
