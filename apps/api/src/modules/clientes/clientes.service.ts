import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
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
  ClienteCreate,
  ClienteQuery,
  ClienteUpdate,
  PosicaoClienteListQuery,
  PosicaoClienteListRow,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  calcularStatusTituloReceber,
  inicioDoDia,
} from '../titulos-receber/titulo-receber-status';
import { podeEmitirBoleto } from '../titulos-receber/boleto-atualizacao';
import { comFlagXml } from '../notas-saida/nota-flags';
import { ClienteCampoConfigService } from '../cliente-campo-config/cliente-campo-config.service';
import { ClienteAlteracoesService } from './cliente-alteracoes.service';
import { EnriquecimentoService } from './enriquecimento.service';
import { ClienteCnaesService } from './cliente-cnaes.service';
import { resolverTabelaPrecoCliente } from '../../common/precos/resolver-tabela-preco-cliente';
import {
  condicaoBuscaTermosSql,
  filtroBuscaTermos,
} from '../../common/busca/termos-busca';
import { escopoLeituraWhatsapp } from '../whatsapp/escopo-whatsapp';

/**
 * O que conta como venda na Posição de Cliente — a mesma definição das
 * Consultas: nota ativa, fora de comodato e do tipo Normal do ERP. Tipo 'D'
 * (devolução/remessa), 'B', 'C' e 'I' são outros documentos e não entram no
 * histórico de compra, no total comprado nem no mix.
 *
 * A aba Comodato é a exceção deliberada: lá o filtro é justamente
 * `comodato: true`, porque a remessa é o assunto da aba.
 */
const NOTA_DE_VENDA = {
  deletedAt: null,
  ativo: true,
  comodato: false,
  tipo: 'N',
} as const;

/** Mesma regra, em SQL — a listagem usa query bruta. */
const NOTA_DE_VENDA_SQL = Prisma.sql`"deletedAt" IS NULL AND "ativo" = true AND "comodato" = false AND "tipo" = 'N'`;

// Colunas calculadas ao vivo (agregação de notas_saida) que a listagem de
// Posição de Cliente aceita ordenar — mapeia sortBy -> expressão/alias SQL já
// presente no SELECT. Whitelist: nunca interpolar sortBy do usuário direto
// na query (ver uso com Prisma.raw abaixo).
const LISTAGEM_POSICAO_SORT_EXPR: Record<string, string> = {
  razaoSocial: 'c."razaoSocial"',
  codigoErp: 'c."codigoErp"',
  municipio: 'c."municipio"',
  ativo: 'c."ativo"',
  ultimaCompra: 'c."ultimaCompra"',
  vendaUltimos30Dias: '"vendaUltimos30Dias"',
  vendaMedia90Dias: '"vendaMedia90Dias"',
  difMesEMedia: '"difMesEMedia"',
  comodato: '"comodato"',
  bloqueado: '"bloqueado"',
};

interface ListagemPosicaoRawRow {
  id: string;
  codigoErp: string | null;
  razaoSocial: string;
  municipio: string | null;
  uf: string | null;
  ativo: boolean;
  ultimaCompra: Date | null;
  vendaUltimos30Dias: number;
  vendaMedia90Dias: number;
  difMesEMedia: number;
  comodato: boolean;
  bloqueado: boolean;
  temTituloVencido: boolean;
  temTituloVencendo: boolean;
  temTituloNaoVencido: boolean;
  whatsappConversaId: string | null;
}

// Campos que a listagem aceita ordenar por — whitelist pra não repassar
// direto pro Prisma um sortBy arbitrário vindo da query string.
const SORT_FIELDS = new Set([
  'razaoSocial',
  'nomeFantasia',
  'codigoErp',
  'cnpjCpf',
  'municipio',
  'uf',
  'ativo',
  'createdAt',
]);

// Dados do vendedor anexados às respostas (coluna "Vendedor" da listagem).
const VENDEDOR_SELECT = { select: { id: true, nome: true, nomeReduzido: true } };

// Dados da tabela de preço vinculada ao cliente (Posição de Cliente usa isso
// pra calcular a coluna "Preço de tabela" do mix).
const TABELA_PRECO_SELECT = { select: { id: true, codigoErp: true, descricao: true } };

// Condição de pagamento vinculada, no mesmo formato.
const CONDICAO_PAGAMENTO_SELECT = {
  select: { id: true, codigoErp: true, descricao: true },
};

// O detalhe do cliente devolve os vínculos já resolvidos porque o formulário
// não consegue descobrir a descrição sozinho: as listas de /tabelas-preco e
// /condicoes-pagamento exigem permissão de cadastro (que o vendedor não tem)
// e trazem só os registros ativos — a maioria das tabelas de preço herdadas
// do legado está inativa. Sem isso o campo aparece em branco mesmo vinculado.
const DETALHE_INCLUDE = {
  vendedor: VENDEDOR_SELECT,
  tabelaPreco: TABELA_PRECO_SELECT,
  condicaoPagamento: CONDICAO_PAGAMENTO_SELECT,
};

// A resolução de escopo hierárquico mora em common/escopo/escopo-vendedores
// — compartilhada com Notas de Saída, Itens e Títulos a Receber.

@Injectable()
export class ClientesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campoConfig: ClienteCampoConfigService,
    private readonly alteracoes: ClienteAlteracoesService,
    private readonly enriquecimento: EnriquecimentoService,
    private readonly clienteCnaes: ClienteCnaesService,
  ) {}

  /**
   * Atualiza o cadastro a partir do CNPJ na base pública da Receita Federal.
   *
   * Uma rotina, dois desfechos deliberadamente diferentes:
   *
   * - **CNAE vazio** (cliente sem nenhum ramo) é preenchimento, não alteração:
   *   não há o que revisar, e exigir aprovação para sair do zero só deixaria o
   *   cadastro vazio por mais tempo. Aplica na hora, com o principal fiscal
   *   que a Receita informou.
   * - **Todo o resto** — razão social, endereço, contato, e o CNAE quando já
   *   existe algum — vai para a fila como solicitação. Quem tem
   *   `clientes.aprovar` escolhe campo a campo o que entra; o que ele não
   *   marcar fica no histórico como reprovado.
   *
   * Campo que a Receita devolve vazio **não** é proposto: a base dela ter um
   * telefone a menos não é motivo para apagar o telefone que o vendedor
   * conseguiu.
   *
   * O retorno é de propósito só nomes de campo e códigos, sem valores — é o
   * que o agente pode repetir ao modelo sem furar a fronteira de dados
   * (`anonimizar-agente.ts`).
   */
  async atualizarPelaReceita(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
  ) {
    const cliente = await this.findOne(empresaId, user, clienteId);
    const cnpj = (cliente.cnpjCpf ?? '').replace(/\D/g, '');
    if (cnpj.length !== 14) {
      return {
        atualizado: false,
        motivo:
          'O cadastro não tem CNPJ de 14 dígitos (pessoa física ou cadastro ' +
          'incompleto). A consulta à Receita Federal só existe para CNPJ.',
      };
    }

    const consulta = await this.enriquecimento.consultarCnpj(cnpj);
    const atuais = await this.clienteCnaes.findAll(empresaId, user, clienteId);
    const codigosAtuais = atuais
      .map((c) => c.codigo)
      .filter((c): c is string => !!c);

    // Código que a referência local do IBGE não conhece não vira vínculo —
    // volta como aviso em vez de sumir (na prática, sync do IBGE atrasado).
    const sugeridos = consulta.cnaes.filter((c) => !!c.cnaeId);
    const semReferencia = consulta.cnaes
      .filter((c) => !c.cnaeId)
      .map((c) => c.codigo);

    const cnaesAplicados: string[] = [];
    if (atuais.length === 0) {
      for (const sugerido of sugeridos) {
        await this.clienteCnaes.create(empresaId, user, clienteId, {
          cnaeId: sugerido.cnaeId as string,
          principal: sugerido.principal,
        });
        cnaesAplicados.push(sugerido.codigo);
      }
    }

    // Só o que a Receita realmente respondeu, e só o que ainda falta.
    const doCadastro: Record<string, unknown> = {};
    const propor = (campo: string, valor: string | null) => {
      if (valor) doCadastro[campo] = valor;
    };
    propor('razaoSocial', consulta.razaoSocial);
    propor('nomeFantasia', consulta.nomeFantasia);
    propor('endereco', consulta.endereco);
    propor('complemento', consulta.complemento);
    propor('bairro', consulta.bairro);
    propor('municipio', consulta.municipio);
    propor('uf', consulta.uf);
    propor('cep', consulta.cep);
    propor('telefone', consulta.telefone);
    propor('telefone2', consulta.telefone2);
    propor('email', consulta.email);

    const input: Record<string, unknown> =
      atuais.length === 0
        ? doCadastro
        : {
            ...doCadastro,
            // União: a fila nunca propõe remover ramo que já está no cadastro.
            cnaes: [
              ...new Set([...codigosAtuais, ...sugeridos.map((c) => c.codigo)]),
            ],
          };

    const registro = await this.prisma.withTenant(empresaId, (tx) =>
      this.alteracoes.registrar(tx, {
        empresaId,
        clienteId,
        atual: { ...cliente, cnaes: codigosAtuais },
        input,
        origem: 'enriquecimento',
        autorId: user.id,
        // Sempre para a fila, inclusive para quem aprova: a Receita traz o
        // cadastro inteiro de uma vez, e o ponto desta rotina é alguém olhar
        // campo a campo antes de sobrescrever o que a equipe cadastrou.
        aplicarDireto: false,
      }),
    );

    const camposPendentes =
      registro.resultado === 'sem-mudanca' ? [] : Object.keys(registro.diff);

    return {
      atualizado: cnaesAplicados.length > 0,
      situacaoCadastral: consulta.situacaoCadastral,
      cnaesAplicados,
      cnaesSemReferencia: semReferencia,
      solicitacaoId:
        registro.resultado === 'pendente' ? registro.solicitacaoId : null,
      camposPendentes,
    };
  }

  private limpar<T extends Record<string, unknown>>(input: T) {
    // Campos string vazios do formulário viram null no banco.
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  /**
   * Impede atribuir um cliente a um vendedor fora do próprio time. Para
   * usuário restrito, vendedorId vazio também é rejeitado — um cliente sem
   * carteira ficaria invisível para o próprio autor.
   */
  private validarVendedorNoEscopo(
    escopo: EscopoVendedores,
    vendedorId: string | null | undefined,
  ) {
    if (escopo === null) return;
    if (vendedorId === undefined) return; // update parcial sem mexer no vendedor
    if (!vendedorId || !escopo.includes(vendedorId)) {
      throw new ForbiddenException('Vendedor fora do seu escopo de acesso');
    }
  }

  findAll(empresaId: string, user: AuthenticatedUser, query: ClienteQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const where = {
        empresaId,
        deletedAt: null,
        ...combinarFiltroVendedor(escopo, query.vendedorId),
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.tipoPessoa ? { tipoPessoa: query.tipoPessoa } : {}),
        ...(query.uf ? { uf: query.uf } : {}),
        ...(query.municipio
          ? {
              municipio: {
                equals: query.municipio,
                mode: 'insensitive' as const,
              },
            }
          : {}),
        ...(query.carteira !== undefined ? { carteira: query.carteira } : {}),
        // Prefixo do código: `some` porque o cliente tem N CNAEs e basta um
        // bater. O vínculo excluído não conta — um ramo removido do cadastro
        // não deve continuar trazendo o cliente na busca.
        ...(query.cnae
          ? {
              cnaes: {
                some: {
                  deletedAt: null,
                  cnae: { codigoErp: { startsWith: query.cnae } },
                },
              },
            }
          : {}),
        // Termo a termo (ver `filtroBuscaTermos`): "ricard patay" encontra
        // "RICARDO PATAY SOTOMAYOR", que o `contains` da frase inteira não
        // encontrava. Usa a chave `AND` — não acrescente outro `AND` aqui.
        ...filtroBuscaTermos(query.search, [
          'razaoSocial',
          'nomeFantasia',
          'codigoErp',
          'cnpjCpf',
        ]),
      };
      const sortField =
        query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'razaoSocial';
      const [data, total] = await Promise.all([
        tx.cliente.findMany({
          where,
          include: { vendedor: VENDEDOR_SELECT },
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.cliente.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  /**
   * Responde **uma única pergunta**: este cliente já existe na base, e de quem
   * é a carteira?
   *
   * É a **exceção deliberada** ao escopo de carteira, e existe por um problema
   * real: sem ela, o vendedor que prospecta uma empresa que já é cliente de um
   * colega não tem como descobrir isso — a busca normal simplesmente não
   * retorna nada, e ele gasta a visita. Ver `buscar_cliente` (com escopo) para
   * o caminho normal.
   *
   * O que a torna segura é o que ela **não** devolve. Só identificação e
   * titularidade: nada de valores, limite, condição de pagamento, contato,
   * histórico ou id utilizável nas outras ferramentas. Quem está fora da
   * carteira aparece como "existe e é do fulano", e para por aí.
   *
   * Ao ampliar o retorno daqui, lembre que este método **ignora o escopo de
   * propósito** — todo campo novo vira dado de carteira alheia visível para o
   * vendedor.
   */
  async verificarTitularidade(
    empresaId: string,
    user: AuthenticatedUser,
    busca: string,
  ) {
    const termo = busca.trim();
    // Busca curta viraria varredura da base inteira, que é justamente o que
    // esta exceção não pode virar.
    if (termo.length < 3) {
      throw new BadRequestException(
        'Informe ao menos 3 caracteres do nome, CNPJ ou código do cliente.',
      );
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);

      const clientes = await tx.cliente.findMany({
        // Sem filtro de vendedor: é o ponto do método.
        where: {
          empresaId,
          deletedAt: null,
          ...filtroBuscaTermos(termo, [
            'razaoSocial',
            'nomeFantasia',
            'codigoErp',
            'cnpjCpf',
          ]),
        },
        select: {
          id: true,
          razaoSocial: true,
          nomeFantasia: true,
          codigoErp: true,
          municipio: true,
          uf: true,
          ativo: true,
          vendedorId: true,
          vendedor: { select: { nome: true, codigoErp: true } },
        },
        orderBy: { razaoSocial: 'asc' },
        // Teto baixo: serve para conferir um cliente, não para listar a base.
        take: 5,
      });

      return {
        encontrados: clientes.length,
        clientes: clientes.map((c) => {
          const meu =
            escopo === null ||
            (!!c.vendedorId && escopo.includes(c.vendedorId));
          return {
            razaoSocial: c.razaoSocial,
            nomeFantasia: c.nomeFantasia,
            codigoErp: c.codigoErp,
            municipio: c.municipio,
            uf: c.uf,
            ativo: c.ativo,
            // Objeto, não string: é o formato que a fronteira de dados do
            // agente reconhece para trocar o nome pela referência opaca
            // (ver `anonimizar-agente.ts`).
            vendedor: c.vendedor,
            naSuaCarteira: meu,
            // O id só sai quando o cliente é da carteira: ele é a chave das
            // outras ferramentas, e devolvê-lo aqui abriria por tabela o
            // acesso que este método existe para não dar.
            clienteId: meu ? c.id : null,
          };
        }),
      };
    });
  }

  async findOne(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const cliente = await tx.cliente.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
        include: DETALHE_INCLUDE,
      });
      if (!cliente) throw new NotFoundException('Cliente não encontrado');

      return cliente;
    });
  }

  create(empresaId: string, user: AuthenticatedUser, input: ClienteCreate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      this.validarVendedorNoEscopo(escopo, input.vendedorId ?? null);
      return tx.cliente.create({
        data: {
          ...(this.limpar(input) as object),
          empresaId,
          createdBy: user.id,
          updatedBy: user.id,
        } as never,
      });
    });
  }

  /**
   * Editar cliente não grava direto: passa pela fila de aprovação
   * (ClienteAlteracoesService). Quem tem `clientes.aprovar` aplica na hora, mas
   * ainda deixa a solicitação registrada como autoaprovada — assim o histórico
   * cobre toda alteração, sem exceção silenciosa.
   *
   * Por isso a resposta é discriminada: `{ aplicado: true, cliente }` ou
   * `{ aplicado: false, solicitacao }`.
   */
  async update(empresaId: string, user: AuthenticatedUser, id: string, input: ClienteUpdate) {
    // Reforço server-side da config de campos editáveis (apps/api/src/modules/
    // cliente-campo-config/) — mesmo que alguém tente forçar via API direto,
    // não só via UI, um campo travado (editavel:false) é ignorado aqui.
    const config = await this.campoConfig.obterConfig(empresaId);
    const inputPermitido = Object.fromEntries(
      Object.entries(input).filter(([campo]) => config[campo] !== false),
    ) as ClienteUpdate;

    const aplicarDireto = this.alteracoes.usuarioAprova(user);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const cliente = await tx.cliente.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
      });
      if (!cliente) throw new NotFoundException('Cliente não encontrado');
      this.validarVendedorNoEscopo(escopo, inputPermitido.vendedorId);

      const registro = await this.alteracoes.registrar(tx, {
        empresaId,
        clienteId: id,
        atual: cliente,
        input: this.limpar(inputPermitido),
        origem: 'manual',
        autorId: user.id,
        aplicarDireto,
      });

      if (registro.resultado === 'pendente') {
        const solicitacao = await tx.clienteAlteracao.findUniqueOrThrow({
          where: { id: registro.solicitacaoId },
          include: {
            cliente: { select: { razaoSocial: true, codigoErp: true } },
          },
        });
        return { aplicado: false as const, solicitacao };
      }

      // 'aplicado' e 'sem-mudanca' devolvem o cliente — no segundo caso, o
      // payload não mudava nada e nada foi gravado.
      const atualizado = await tx.cliente.findUniqueOrThrow({
        where: { id },
        include: DETALHE_INCLUDE,
      });
      return { aplicado: true as const, cliente: atualizado };
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const cliente = await tx.cliente.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
      });
      if (!cliente) throw new NotFoundException('Cliente não encontrado');
      return tx.cliente.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
    });
  }

  /**
   * Mix de produtos comprados pelo cliente (código, descrição, última
   * compra, preço/desconto praticados na compra mais recente, preço vigente
   * na tabela de preço do cliente). Compartilhado entre Posição de Cliente
   * (aba Mix, read-only) e Orçamento (aba Mix, com "adicionar ao orçamento"
   * usando esses mesmos valores/%).
   */
  private async mixProdutos(
    tx: TenantTx,
    empresaId: string,
    clienteId: string,
    tabelaPrecoId: string | null,
  ) {
    const mixGrupos = await tx.notaSaidaItem.groupBy({
      by: ['produtoId'],
      where: {
        clienteId,
        empresaId,
        deletedAt: null,
        produtoId: { not: null },
        notaSaida: NOTA_DE_VENDA,
      },
      _max: { dtEmissao: true },
    });

    const produtoIds = mixGrupos
      .map((g) => g.produtoId)
      .filter((id): id is string => id !== null);
    const [produtos, itensTabelaPreco, ultimosItens] = await Promise.all([
      tx.produto.findMany({
        where: { id: { in: produtoIds } },
        select: {
          id: true,
          codigoErp: true,
          descricao: true,
          unidade: true,
          ativo: true,
        },
      }),
      tabelaPrecoId
        ? tx.tabelaPrecoItem.findMany({
            where: {
              tabelaPrecoId,
              produtoId: { in: produtoIds },
              deletedAt: null,
            },
            select: { produtoId: true, preco: true },
          })
        : Promise.resolve([] as { produtoId: string; preco: number }[]),
      // Preço/desconto praticados na última compra de cada produto — casa
      // (produtoId, dtEmissao) com o máximo já apurado no groupBy acima
      // (não dá pra pedir "o vlrUnitario da linha mais recente" direto num
      // groupBy).
      produtoIds.length
        ? tx.notaSaidaItem.findMany({
            where: {
              clienteId,
              empresaId,
              deletedAt: null,
              notaSaida: NOTA_DE_VENDA,
              OR: mixGrupos
                .filter((g) => g.produtoId && g._max.dtEmissao)
                .map((g) => ({
                  produtoId: g.produtoId,
                  dtEmissao: g._max.dtEmissao,
                })),
            },
            select: {
              produtoId: true,
              vlrUnitario: true,
              percDesconto: true,
            },
          })
        : Promise.resolve(
            [] as {
              produtoId: string | null;
              vlrUnitario: number;
              percDesconto: number | null;
            }[],
          ),
    ]);
    const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
    const precoPorProduto = new Map(
      itensTabelaPreco.map((i) => [i.produtoId, i.preco]),
    );
    const ultimoPorProduto = new Map<
      string,
      { vlrUnitario: number; percDesconto: number | null }
    >();
    for (const item of ultimosItens) {
      if (item.produtoId && !ultimoPorProduto.has(item.produtoId)) {
        ultimoPorProduto.set(item.produtoId, {
          vlrUnitario: item.vlrUnitario,
          percDesconto: item.percDesconto,
        });
      }
    }

    return mixGrupos
      .map((g) => {
        const produto = g.produtoId ? produtoPorId.get(g.produtoId) : undefined;
        const ultimo = g.produtoId
          ? ultimoPorProduto.get(g.produtoId)
          : undefined;
        return {
          produtoId: g.produtoId as string,
          codigoErp: produto?.codigoErp ?? '—',
          descricao: produto?.descricao ?? '—',
          unidade: produto?.unidade ?? null,
          ultimaCompra: g._max.dtEmissao,
          ultimoPrecoUnitario: ultimo?.vlrUnitario ?? null,
          ultimoDesconto: ultimo?.percDesconto ?? null,
          precoTabela: g.produtoId
            ? (precoPorProduto.get(g.produtoId) ?? null)
            : null,
          ativo: produto?.ativo ?? true,
        };
      })
      .sort((a, b) => {
        const dataA = a.ultimaCompra ? a.ultimaCompra.getTime() : 0;
        const dataB = b.ultimaCompra ? b.ultimaCompra.getTime() : 0;
        return dataB - dataA;
      });
  }

  /**
   * Mix de produtos do cliente, isolado da Posição de Cliente completa —
   * usado pela aba "Mix" do formulário de Orçamento (adicionar item usando
   * valores/% da última venda).
   */
  async mix(empresaId: string, user: AuthenticatedUser, clienteId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const filtroEscopo = escopo ? { vendedorId: { in: escopo } } : {};
      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId, empresaId, deletedAt: null, ...filtroEscopo },
        select: { tabelaPrecoId: true },
      });
      if (!cliente) throw new NotFoundException('Cliente não encontrado');
      return this.mixProdutos(
        tx,
        empresaId,
        clienteId,
        await resolverTabelaPrecoCliente(tx, empresaId, clienteId),
      );
    });
  }

  /**
   * Posição de Cliente: tela agrupada (cliente + notas de saída + títulos a
   * receber + mix de produtos comprados), cada bloco ligado ao registro
   * detalhado correspondente (nota, produto). Read-only — os dados entram
   * pelo import do ERP.
   */
  async posicao(empresaId: string, user: AuthenticatedUser, clienteId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const filtroEscopo = escopo ? { vendedorId: { in: escopo } } : {};

      const cliente = await tx.cliente.findFirst({
        where: { id: clienteId, empresaId, deletedAt: null, ...filtroEscopo },
        include: {
          vendedor: VENDEDOR_SELECT,
          tabelaPreco: TABELA_PRECO_SELECT,
        },
      });
      if (!cliente) throw new NotFoundException('Cliente não encontrado');

      // A posição informa o vínculo com o WhatsApp somente quando o usuário
      // pode abrir a conversa. É o mesmo escopo da Central de Atendimento.
      const podeVerWhatsapp =
        user.isAdmin || user.permissoes.includes('whatsapp-conversas.visualizar');
      const escopoWa = podeVerWhatsapp
        ? await escopoLeituraWhatsapp(tx, empresaId, user)
        : [];
      const conversasWhatsapp = podeVerWhatsapp
        ? await tx.whatsappConversa.findMany({
            where: {
              clienteId,
              empresaId,
              ...(escopoWa === null
                ? {}
                : { sessao: { vendedorId: { in: escopoWa } } }),
            },
            orderBy: [{ arquivada: 'asc' }, { ultimaMensagemEm: 'desc' }],
            select: {
              id: true,
              contato: {
                select: {
                  id: true,
                  nomeExibicao: true,
                  tipo: true,
                  telefoneNormalizado: true,
                  email: true,
                  fotoUrl: true,
                },
              },
            },
          })
        : [];

      // Escopo já foi verificado acima via cliente.vendedorId — não reaplicar
      // filtroEscopo nas notas/títulos, pois o vendedorId de cada um deles é
      // "quem executou aquele registro" (pode divergir do vendedor titular
      // do cliente) e não deve restringir a visibilidade de dados de um
      // cliente que o usuário já está autorizado a ver.
      const [notas, comodatos, titulos, mix] = await Promise.all([
        // Só o histórico de venda efetiva (ver NOTA_DE_VENDA): nota inativa
        // (cancelada no ERP), devolução/remessa e comodato não entram nem na
        // lista nem no resumo — o legado tem muita nota inativa zerada, que
        // só polui a consulta.
        tx.notaSaida.findMany({
          where: { clienteId, empresaId, ...NOTA_DE_VENDA },
          include: { vendedor: VENDEDOR_SELECT },
          orderBy: { dtEmissao: 'desc' },
        }),
        // Comodato tem aba própria: é remessa, não venda. Aqui não se filtra
        // por tipo — o que interessa é a movimentação de comodato do cliente,
        // inclusive uma eventual devolução.
        tx.notaSaida.findMany({
          where: {
            clienteId,
            empresaId,
            deletedAt: null,
            ativo: true,
            comodato: true,
          },
          include: { vendedor: VENDEDOR_SELECT },
          orderBy: { dtEmissao: 'desc' },
        }),
        tx.tituloReceber.findMany({
          // Título inativo no ERP é cancelado/estornado e não representa
          // cobrança. Não pode aparecer na aba nem compor saldo em aberto.
          where: { clienteId, empresaId, deletedAt: null, ativo: true },
          orderBy: { vencimento: 'desc' },
        }),
        // Preço de tabela do mix segue a mesma regra do orçamento: tabela do
        // cadastro quando válida, senão a padrão de capital/interior.
        resolverTabelaPrecoCliente(tx, empresaId, clienteId).then((tabelaId) =>
          this.mixProdutos(tx, empresaId, clienteId, tabelaId),
        ),
      ]);

      // Conta de cobrança padrão: decide se o título sem conta própria pode
      // oferecer 2ª via de boleto. Uma consulta para a página toda, não uma
      // por título (ver `podeEmitirBoleto`).
      const temContaPadrao = !!(await tx.contaBancaria.findFirst({
        where: { empresaId, deletedAt: null, ativo: true, padrao: true },
        select: { id: true },
      }));

      // Corte na meia-noite: "Títulos vencidos" soma só quem venceu antes de
      // hoje — quem vence hoje ainda conta como em aberto.
      const hoje = inicioDoDia();
      const titulosComStatus = titulos.map((titulo) => ({
        ...titulo,
        status: calcularStatusTituloReceber(titulo, hoje),
        temBoleto: podeEmitirBoleto(titulo, temContaPadrao, hoje),
      }));
      const titulosAbertos = titulosComStatus.filter(
        (t) => t.status !== 'baixado',
      );
      const resumo = {
        totalNotas: notas.length,
        totalComprado: notas.reduce((acc, n) => acc + n.vlrBruto, 0),
        totalTitulosAberto: titulosAbertos.reduce((acc, t) => acc + t.saldo, 0),
        totalTitulosVencido: titulosAbertos
          .filter((t) => t.status === 'vencido')
          .reduce((acc, t) => acc + t.saldo, 0),
      };

      return {
        cliente,
        whatsapp: Array.from(
          new Map(
            conversasWhatsapp.map((conversa) => [
              conversa.contato.id,
              {
                conversaId: conversa.id,
                nome: conversa.contato.nomeExibicao,
                tipo: conversa.contato.tipo,
                telefone: conversa.contato.telefoneNormalizado,
                email: conversa.contato.email,
                fotoUrl: conversa.contato.fotoUrl,
              },
            ]),
          ).values(),
        ),
        resumo,
        // A flag de XML vem do mesmo helper das rotinas de Notas de Saída — a
        // tela de posição oferece o mesmo botão de 2ª via e não pode divergir.
        notas: notas.map(comFlagXml),
        comodatos: comodatos.map(comFlagXml),
        titulos: titulosComStatus,
        mix,
      };
    });
  }

  /**
   * Listagem de Posição de Cliente: mesma carteira de Clientes, mas com
   * colunas de venda calculadas ao vivo por agregação de notas_saida (venda
   * dos últimos 30 dias, média mensal dos últimos 90 dias, diferença entre
   * as duas, comodato em aberto, bloqueio). Paginação/ordenação acontecem no
   * banco via SQL bruto — não dá pra ordenar por coluna agregada com o
   * query builder do Prisma, e ORDER BY teria que rodar antes do LIMIT.
   */
  async listagemPosicao(
    empresaId: string,
    user: AuthenticatedUser,
    query: PosicaoClienteListQuery,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);

      const condicoes: Prisma.Sql[] = [
        Prisma.sql`c."empresaId" = ${empresaId}`,
        Prisma.sql`c."deletedAt" IS NULL`,
      ];

      if (escopo !== null) {
        condicoes.push(
          escopo.length > 0
            ? Prisma.sql`c."vendedorId" IN (${Prisma.join(escopo)})`
            : Prisma.sql`false`,
        );
      }
      if (query.vendedorId) {
        condicoes.push(
          escopo !== null && !escopo.includes(query.vendedorId)
            ? Prisma.sql`false`
            : Prisma.sql`c."vendedorId" = ${query.vendedorId}`,
        );
      }
      if (query.ativo !== undefined) condicoes.push(Prisma.sql`c."ativo" = ${query.ativo}`);
      if (query.uf) condicoes.push(Prisma.sql`c."uf" = ${query.uf}`);
      if (query.municipio) condicoes.push(Prisma.sql`c."municipio" = ${query.municipio}`);
      if (query.carteira !== undefined)
        condicoes.push(Prisma.sql`c."carteira" = ${query.carteira}`);
      const buscaSql = condicaoBuscaTermosSql(query.search, [
        Prisma.sql`c."razaoSocial"`,
        Prisma.sql`c."nomeFantasia"`,
        Prisma.sql`c."codigoErp"`,
        Prisma.sql`c."cnpjCpf"`,
      ]);
      if (buscaSql) condicoes.push(buscaSql);
      if (query.diasSemComprar !== undefined) {
        condicoes.push(
          Prisma.sql`(c."ultimaCompra" IS NULL OR c."ultimaCompra" <= now() - (${query.diasSemComprar} * interval '1 day'))`,
        );
      }
      if (query.bloqueado !== undefined) {
        const bloqueadoExpr = Prisma.sql`(c."dataBloqueio" IS NOT NULL AND (c."dataReativacao" IS NULL OR c."dataReativacao" < c."dataBloqueio"))`;
        condicoes.push(query.bloqueado ? bloqueadoExpr : Prisma.sql`NOT ${bloqueadoExpr}`);
      }

      const where = Prisma.join(condicoes, ' AND ');

      // Escopo de leitura do WhatsApp, que **não** é o mesmo da carteira: ler
      // conversa da equipe exige `whatsapp-equipe.visualizar`, e quem não tem
      // cadastro de vendedor não vê nenhuma (ver `escopoLeituraWhatsapp`).
      // Resolvido aqui, uma vez, e não por linha.
      const escopoWa = await escopoLeituraWhatsapp(tx, empresaId, user);
      const escopoWhatsapp =
        escopoWa === null
          ? Prisma.sql`true`
          : escopoWa.length > 0
            ? Prisma.sql`ws."vendedorId" IN (${Prisma.join(escopoWa)})`
            : Prisma.sql`false`;

      const sortField =
        query.sortBy && LISTAGEM_POSICAO_SORT_EXPR[query.sortBy] ? query.sortBy : 'ultimaCompra';
      const sortDir = query.sortOrder === 'desc' ? 'DESC' : 'ASC';
      // "dias" (dias sem comprar) é o inverso de ultimaCompra: menos dias =
      // compra mais recente = ultimaCompra maior. NULLS explícito porque o
      // cliente sem nenhuma compra deve valer "infinitos dias".
      const orderBy =
        query.sortBy === 'dias'
          ? sortDir === 'ASC'
            ? Prisma.raw('c."ultimaCompra" DESC NULLS LAST')
            : Prisma.raw('c."ultimaCompra" ASC NULLS FIRST')
          : Prisma.raw(`${LISTAGEM_POSICAO_SORT_EXPR[sortField]} ${sortDir}`);

      const { skip, take } = paginationToSkipTake(query);

      const select = Prisma.sql`
        SELECT
          c.id,
          c."codigoErp",
          c."razaoSocial",
          c."municipio",
          c."uf",
          c."ativo",
          c."ultimaCompra",
          COALESCE(v30.total, 0) AS "vendaUltimos30Dias",
          COALESCE(v90.total, 0) / 3.0 AS "vendaMedia90Dias",
          COALESCE(v30.total, 0) - (COALESCE(v90.total, 0) / 3.0) AS "difMesEMedia",
          EXISTS (
            SELECT 1 FROM notas_saida cm
            WHERE cm."clienteId" = c.id AND cm."empresaId" = c."empresaId"
              AND cm."comodato" = true AND cm."deletedAt" IS NULL
          ) AS "comodato",
          (c."dataBloqueio" IS NOT NULL AND (c."dataReativacao" IS NULL OR c."dataReativacao" < c."dataBloqueio")) AS "bloqueado",
          -- Vencimento é data pura: o corte é CURRENT_DATE, não now(), senão
          -- quem vence hoje já apareceria como vencido depois da meia-noite
          -- (mesma regra de calcularStatusTituloReceber).
          EXISTS (
            SELECT 1 FROM titulos_receber tv
            WHERE tv."clienteId" = c.id AND tv."empresaId" = c."empresaId"
              AND tv."deletedAt" IS NULL AND tv."dtBaixa" IS NULL AND tv."vencimento" < CURRENT_DATE
          ) AS "temTituloVencido",
          EXISTS (
            SELECT 1 FROM titulos_receber tz
            WHERE tz."clienteId" = c.id AND tz."empresaId" = c."empresaId"
              AND tz."deletedAt" IS NULL AND tz."dtBaixa" IS NULL
              AND tz."vencimento" >= CURRENT_DATE AND tz."vencimento" < CURRENT_DATE + interval '7 days'
          ) AS "temTituloVencendo",
          EXISTS (
            SELECT 1 FROM titulos_receber ta
            WHERE ta."clienteId" = c.id AND ta."empresaId" = c."empresaId"
              AND ta."deletedAt" IS NULL AND ta."dtBaixa" IS NULL
              AND (ta."vencimento" IS NULL OR ta."vencimento" >= CURRENT_DATE + interval '7 days')
          ) AS "temTituloNaoVencido",
          -- Conversa de WhatsApp que ESTE usuário pode abrir, para a ação
          -- "Atendimento" do menu da linha. Sai nulo quando o cliente não tem
          -- contato vinculado — e também quando a conversa existe mas é de um
          -- vendedor fora do escopo de leitura dele: oferecer o atalho já
          -- contaria que a conversa existe, e conversa de cliente é dado
          -- pessoal (mesma regra do filtro da tela de Atendimento).
          --
          -- Não arquivada primeiro: a arquivada abre, mas o cabeçalho da tela
          -- se apoia na listagem padrão, que não a traz.
          (
            SELECT wc."id" FROM whatsapp_conversas wc
            JOIN whatsapp_sessoes ws ON ws."id" = wc."sessaoId"
            WHERE wc."clienteId" = c.id
              AND wc."empresaId" = c."empresaId"
              AND ${escopoWhatsapp}
            ORDER BY wc."arquivada" ASC, wc."ultimaMensagemEm" DESC NULLS LAST
            LIMIT 1
          ) AS "whatsappConversaId"
        FROM clientes c
        -- Venda dos últimos 30/90 dias conta só nota de venda, igual à aba de
        -- notas do detalhe e às Consultas (ver NOTA_DE_VENDA_SQL).
        LEFT JOIN (
          SELECT "clienteId", SUM("vlrBruto") AS total
          FROM notas_saida
          WHERE "empresaId" = ${empresaId} AND ${NOTA_DE_VENDA_SQL}
            AND "dtEmissao" >= now() - interval '30 days'
          GROUP BY "clienteId"
        ) v30 ON v30."clienteId" = c.id
        LEFT JOIN (
          SELECT "clienteId", SUM("vlrBruto") AS total
          FROM notas_saida
          WHERE "empresaId" = ${empresaId} AND ${NOTA_DE_VENDA_SQL}
            AND "dtEmissao" >= now() - interval '90 days'
          GROUP BY "clienteId"
        ) v90 ON v90."clienteId" = c.id
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${take} OFFSET ${skip}
      `;
      const countSelect = Prisma.sql`SELECT COUNT(*)::int AS count FROM clientes c WHERE ${where}`;

      const [rows, countRows] = await Promise.all([
        tx.$queryRaw<ListagemPosicaoRawRow[]>(select),
        tx.$queryRaw<{ count: number }[]>(countSelect),
      ]);

      const agora = new Date().getTime();
      const data: PosicaoClienteListRow[] = rows.map((r) => ({
        id: r.id,
        codigoErp: r.codigoErp,
        razaoSocial: r.razaoSocial,
        municipio: r.municipio,
        uf: r.uf,
        ativo: r.ativo,
        ultimaCompra: r.ultimaCompra ? r.ultimaCompra.toISOString() : null,
        dias: r.ultimaCompra ? Math.floor((agora - r.ultimaCompra.getTime()) / 86_400_000) : null,
        vendaUltimos30Dias: Number(r.vendaUltimos30Dias),
        vendaMedia90Dias: Number(r.vendaMedia90Dias),
        difMesEMedia: Number(r.difMesEMedia),
        comodato: r.comodato,
        bloqueado: r.bloqueado,
        temTituloVencido: r.temTituloVencido,
        temTituloVencendo: r.temTituloVencendo,
        temTituloNaoVencido: r.temTituloNaoVencido,
        whatsappConversaId: r.whatsappConversaId,
      }));

      return buildPaginatedResult(data, countRows[0]?.count ?? 0, query);
    });
  }

  /**
   * Vendedores dentro do escopo do usuário logado — alimenta o filtro
   * "Vendedor" da listagem e o Select do formulário sem expor o
   * VendedoresController (que não tem restrição de carteira).
   *
   * ehVendedorPuro: true só quando o próprio usuário é um vendedor "de
   * carteira" (nem supervisor nem gerente) — a tela usa isso pra esconder o
   * filtro Vendedor por completo (filtrar pela própria carteira não faz
   * sentido). Supervisor/gerente continuam vendo o filtro, já restrito ao
   * próprio time pelo escopo acima.
   *
   * meuVendedorId: id do Vendedor vinculado ao usuário logado (null se não
   * houver vínculo) — usado por telas com filtro de Vendedor (ex.: Dashboard
   * Comercial) pra pré-selecionar a própria carteira em vez de "Todos".
   */
  vendedoresEscopo(
    empresaId: string,
    user: AuthenticatedUser,
    apenasComCliente = false,
    filtros: { uf?: string; municipio?: string } = {},
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const [escopo, vendedorProprio] = await Promise.all([
        resolverEscopoVendedores(tx, empresaId, user),
        tx.vendedor.findFirst({
          where: { usuarioId: user.id, empresaId, deletedAt: null },
          select: { id: true, tipo: true },
        }),
      ]);
      // uf/municipio (facetas irmãs já selecionadas no filtro) sempre
      // restringem a "tem cliente que bate com isso", mesmo sem
      // apenasComCliente — é o mesmo cliente-relation-filter, só que também
      // casado com uf/municipio quando informados.
      const clientesFiltro = {
        deletedAt: null,
        ...(filtros.uf ? { uf: filtros.uf } : {}),
        ...(filtros.municipio ? { municipio: filtros.municipio } : {}),
      };
      const exigeCliente =
        apenasComCliente || !!filtros.uf || !!filtros.municipio;
      const vendedores = await tx.vendedor.findMany({
        where: {
          empresaId,
          deletedAt: null,
          // Só quem é do tipo `vendedor`: os selects de Vendedor do sistema
          // (orçamento, atividade, filtros) escolhem quem atende o cliente, e
          // supervisor/gerente estão na hierarquia para enxergar o time, não
          // para receber carteira.
          tipo: 'vendedor',
          // apenasComCliente inclui vendedor bloqueado (ativo:false) de
          // propósito — é útil justamente pra localizar/filtrar carteira de
          // um vendedor que foi bloqueado mas ainda tem clientes vinculados.
          ...(apenasComCliente ? {} : { ativo: true }),
          ...(exigeCliente ? { clientes: { some: clientesFiltro } } : {}),
          ...(escopo ? { id: { in: escopo } } : {}),
        },
        orderBy: { nome: 'asc' },
      });

      // Quantidade de clientes por vendedor — exibida nos selects de filtro
      // de vendedor do sistema (já considerando uf/municipio selecionados).
      // Só conta cliente ativo: cliente inativo não deveria "inflar" o
      // número mostrado ao lado do vendedor no filtro.
      const contagens = await tx.cliente.groupBy({
        by: ['vendedorId'],
        where: {
          empresaId,
          deletedAt: null,
          ativo: true,
          vendedorId: { in: vendedores.map((v) => v.id) },
          ...(filtros.uf ? { uf: filtros.uf } : {}),
          ...(filtros.municipio ? { municipio: filtros.municipio } : {}),
        },
        _count: { _all: true },
      });
      const totalPorVendedor = new Map(
        contagens.map((c) => [c.vendedorId, c._count._all]),
      );
      const data = vendedores.map((v) => ({
        ...v,
        totalClientes: totalPorVendedor.get(v.id) ?? 0,
      }));

      const ehVendedorPuro =
        escopo !== null && vendedorProprio?.tipo === 'vendedor';
      return {
        data,
        restrito: escopo !== null,
        ehVendedorPuro,
        meuVendedorId: vendedorProprio?.id ?? null,
      };
    });
  }

  /**
   * Municípios distintos presentes na carteira visível ao usuário logado —
   * alimenta o filtro "Município" da listagem de Posição de Cliente. Mesmo
   * racional de vendedoresEscopo: nunca expõe municípios de clientes fora do
   * escopo hierárquico do usuário. uf/vendedorId (facetas irmãs já
   * selecionadas) restringem a contagem — selecionar uma UF só mostra os
   * municípios daquela UF.
   */
  municipiosEscopo(
    empresaId: string,
    user: AuthenticatedUser,
    filtros: { uf?: string; vendedorId?: string } = {},
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const grupos = await tx.cliente.groupBy({
        by: ['municipio'],
        where: {
          empresaId,
          deletedAt: null,
          municipio: { not: null },
          ...(filtros.uf ? { uf: filtros.uf } : {}),
          ...combinarFiltroVendedor(escopo, filtros.vendedorId),
        },
        _count: { _all: true },
        orderBy: { municipio: 'asc' },
      });
      return {
        data: grupos.map((g) => ({
          municipio: g.municipio as string,
          total: g._count._all,
        })),
      };
    });
  }

  /**
   * UFs distintas presentes na carteira visível ao usuário logado — alimenta
   * o filtro "UF" (Clientes e Posição de Cliente). Mesmo racional de
   * municipiosEscopo: só lista o que realmente existe no cadastro, e nunca
   * expõe UFs de clientes fora do escopo hierárquico do usuário.
   * município/vendedorId (facetas irmãs já selecionadas) restringem a
   * contagem, mesma regra de municipiosEscopo.
   */
  ufsEscopo(
    empresaId: string,
    user: AuthenticatedUser,
    filtros: { municipio?: string; vendedorId?: string } = {},
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const grupos = await tx.cliente.groupBy({
        by: ['uf'],
        where: {
          empresaId,
          deletedAt: null,
          uf: { not: null },
          ...(filtros.municipio ? { municipio: filtros.municipio } : {}),
          ...combinarFiltroVendedor(escopo, filtros.vendedorId),
        },
        _count: { _all: true },
        orderBy: { uf: 'asc' },
      });
      return {
        data: grupos.map((g) => ({ uf: g.uf as string, total: g._count._all })),
      };
    });
  }
}
