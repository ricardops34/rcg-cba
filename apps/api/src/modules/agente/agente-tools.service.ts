import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConsultasService } from '../consultas/consultas.service';
import { ClientesService } from '../clientes/clientes.service';
import { ProdutosService } from '../produtos/produtos.service';
import { OrcamentosService } from '../orcamentos/orcamentos.service';
import { TitulosReceberService } from '../titulos-receber/titulos-receber.service';
import { SugestaoCompraService } from '../sugestao-compra/sugestao-compra.service';
import { ObjetivosService } from '../objetivos/objetivos.service';
import { EnriquecimentoService } from '../clientes/enriquecimento.service';
import type { AgenteDestino } from '@plataforma/contracts';
import type { FerramentaChat } from './provedor-ia';
// Só o tipo: `import type` some no build, então não há ciclo em runtime com
// o serviço de governança, que importa esta classe.
import type { FiltroFerramentas } from './agente-ferramentas.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Catálogo de ferramentas do agente.
 *
 * Regra inegociável: **nenhuma ferramenta toca o Prisma direto.** Cada uma
 * delega ao service que a tela já usa, passando o mesmo `AuthenticatedUser` da
 * requisição. Assim o `withTenant`/RLS, o escopo hierárquico de carteira e as
 * regras de comissão continuam valendo sem serem reimplementadas — e sem poder
 * ser esquecidas aqui.
 *
 * A permissão é checada **duas vezes**, de propósito:
 *
 * 1. na montagem do prompt, filtrando o catálogo — o modelo nem enxerga o que
 *    o usuário não pode fazer, então não promete o que não vai entregar;
 * 2. na execução, antes de chamar o service — porque um `tool_call` é texto
 *    gerado por um modelo e não é confiável como autorização.
 */

export interface Ferramenta {
  nome: string;
  descricao: string;
  parametros: Record<string, unknown>;
  /** `rotina.acao`, mesma semântica do @RequirePermission. */
  permissao: string;
  /** Ferramenta que grava não executa direto — vira pendência de confirmação. */
  escrita?: boolean;
  /** Resumo legível da ação, para o card de confirmação. */
  resumir?: (args: Record<string, unknown>) => string;
  /**
   * Perguntas que esta ferramenta responde, na língua de quem pergunta.
   *
   * Vão para a **página de ajuda**, não para o modelo: quem abre o assistente
   * pela primeira vez não sabe o que dá para pedir, e uma lista de nomes de
   * ferramenta (`vendas_por_cliente`) não ensina isso. Escreva a frase que o
   * vendedor diria.
   */
  exemplos?: string[];
  /**
   * Quantos itens de lista o modelo pode ver neste resultado (padrão em
   * `resumirResultado`). Só faz sentido subir quando a ferramenta já devolve
   * um payload enxuto: a lista maior tem de caber no teto de caracteres, ou o
   * corte volta pelo outro lado.
   */
  limiteItens?: number;
  /**
   * A tela onde ver o que esta ferramenta consultou ou gravou.
   *
   * Existe porque o chat mostra **menos** do que a ferramenta viu: o resultado
   * é podado e cortado antes de ir ao modelo, e a resposta é prosa. Sem um
   * caminho de volta para a tela, quem perguntou fica sabendo que "há 4 títulos
   * vencidos" e tem de procurar onde. É também o que leva quem pode aprovar
   * até a fila, depois de o agente propor uma alteração de cadastro.
   *
   * Montado aqui, no servidor, a partir do resultado real — o modelo não
   * escreve link (nem enxerga os ids). Devolve `null` quando não há tela
   * correspondente, e é o caso de ferramenta cujo resultado cabe inteiro na
   * resposta.
   */
  destino?: (
    args: Record<string, unknown>,
    resultado: unknown,
  ) => Destino | Destino[] | null;
  executar: (
    args: Record<string, unknown>,
    user: AuthenticatedUser,
  ) => Promise<unknown>;
}

/** Ver `Ferramenta.destino`. */
type Destino = AgenteDestino;

/** Formato mínimo que a projeção da busca de clientes consome. */
interface ClientePaginado {
  data: {
    id: string;
    codigoErp: string | null;
    razaoSocial: string;
    nomeFantasia: string | null;
    municipio: string | null;
    uf: string | null;
    ativo: boolean;
    carteira: boolean;
    vendedor: { nome: string; codigoErp: string | null } | null;
  }[];
  total: number;
}

/**
 * Recorta a busca de clientes, com o **total na frente**.
 *
 * Duas coisas quebravam aqui, e a mesma correção resolve as duas. O cadastro
 * inteiro de 10 clientes estoura o teto de caracteres do resultado
 * (`resumirResultado`), e o corte é por ordem de chave: como `total` vem
 * depois de `data` na página do Prisma, ele era a primeira vítima. O agente
 * então respondia "a consulta retorna a lista truncada e não consigo totalizar"
 * — com o número ali, cortado a poucos caracteres de distância.
 *
 * Agora vai só o que identifica cada cliente, e a contagem primeiro: "quantos
 * clientes ativos eu tenho" se responde com `total`, sem precisar contar
 * linha.
 */
function resumirClientes(p: ClientePaginado) {
  return {
    // Total da consulta inteira, não da página — é a resposta de "quantos".
    total: p.total,
    mostrando: p.data.length,
    clientes: p.data.map((c) => ({
      // O id segue porque é o que as outras ferramentas pedem — e é dele que
      // sai o link "Abrir o cliente".
      id: c.id,
      codigoErp: c.codigoErp,
      razaoSocial: c.razaoSocial,
      municipio: c.municipio,
      uf: c.uf,
      ativo: c.ativo,
      carteira: c.carteira,
      vendedor: c.vendedor,
    })),
  };
}

/**
 * Rota da tela **com os mesmos filtros** que a ferramenta usou.
 *
 * É o que fecha o ciclo: o agente responde "42 clientes ativos em Campo
 * Grande" e o botão abre a listagem já naquele recorte, em vez da base inteira
 * — refazer o filtro à mão depois de pedi-lo em português é o pior dos dois
 * mundos. Do outro lado, a tela lê estes parâmetros na entrada (ver
 * `useFiltrosUrl`, no web); parâmetro que a tela não conhece é ignorado, então
 * acrescentar um aqui nunca quebra a navegação.
 */
const rotaComFiltros = (
  rota: string,
  filtros: Record<string, string | number | boolean | null | undefined>,
): string => {
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor === null || valor === undefined || valor === '') continue;
    params.set(chave, String(valor));
  }
  const qs = params.toString();
  return qs ? `${rota}?${qs}` : rota;
};

/**
 * O id quando a consulta achou **um** registro só — é o que decide entre
 * mandar o botão para o cadastro específico ou para a lista.
 */
const primeiroId = (resultado: unknown, chave = 'data'): string | null => {
  const dados = (resultado as Record<string, unknown> | null)?.[chave];
  if (!Array.isArray(dados) || dados.length !== 1) return null;
  const id = (dados[0] as { id?: unknown })?.id;
  return typeof id === 'string' ? id : null;
};

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const numero = (v: unknown, padrao: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : padrao;

/** `2026-08-25`. O ISO completo gasta o dobro e o agente não usa a hora. */
const dia = (d: Date | null | undefined): string | null =>
  d ? d.toISOString().slice(0, 10) : null;

/** Quantos produtos do mix o modelo enxerga. Ver `POSICAO_LIMITE_ITENS`. */
const MIX_NO_RESUMO = 20;
/** Idem para as listas de apoio (últimas notas, títulos vencidos). */
const POSICAO_LIMITE_ITENS = 20;

/** Formato mínimo que a projeção da posição consome — o payload real traz muito mais. */
interface PosicaoBruta {
  cliente: {
    codigoErp: string | null;
    razaoSocial: string;
    nomeFantasia: string | null;
    municipio: string | null;
    uf: string | null;
    ativo: boolean;
    vendedor: { nome: string; codigoErp: string | null } | null;
  };
  resumo: {
    totalNotas: number;
    totalComprado: number;
    totalTitulosAberto: number;
    totalTitulosVencido: number;
  };
  notas: { numero: string; dtEmissao: Date | null; vlrBruto: number }[];
  comodatos: unknown[];
  titulos: {
    numero: string;
    parcela: string | null;
    vencimento: Date | null;
    saldo: number;
    status: string;
  }[];
  mix: {
    codigoErp: string;
    descricao: string;
    unidade: string | null;
    ultimaCompra: Date | null;
    ultimoPrecoUnitario: number | null;
    ultimoDesconto: number | null;
    precoTabela: number | null;
  }[];
}

/**
 * Recorta a Posição de Cliente para o que cabe numa resposta do agente.
 *
 * O payload da tela passa de 400 KB num cliente com histórico — e o resultado
 * de ferramenta é cortado em poucos milhares de caracteres antes de ir ao
 * modelo (ver `resumirResultado`). O corte é por ordem de chave, então o
 * **mix ia inteiro para o lixo**: o agente respondia "o cliente tem 50 notas e
 * R$ 3.717,50 em compras, mas não consegui o detalhamento dos produtos" —
 * dados que estavam ali, só não couberam.
 *
 * Por isso a escolha aqui é o mix primeiro e completo o suficiente para
 * responder "o que ele compra", com notas e títulos reduzidos ao que sustenta
 * a conversa. A tela continua recebendo o payload inteiro pelo endpoint dela.
 */
function resumirPosicao(p: PosicaoBruta) {
  const vencidos = p.titulos.filter((t) => t.status === 'vencido');
  const abertos = p.titulos.filter((t) => t.status !== 'baixado');
  return {
    // Só a identificação: o cadastro inteiro (limite, condição de pagamento,
    // tabela, endereço) engorda o payload sem responder nada que se pergunte
    // ao agente. `razaoSocial` segue porque é o que vira `«CLI:…»`.
    cliente: {
      codigoErp: p.cliente.codigoErp,
      razaoSocial: p.cliente.razaoSocial,
      municipio: p.cliente.municipio,
      uf: p.cliente.uf,
      ativo: p.cliente.ativo,
      vendedor: p.cliente.vendedor,
    },
    resumo: {
      ...p.resumo,
      produtosNoMix: p.mix.length,
      ultimaCompra: dia(p.notas[0]?.dtEmissao),
      totalComodatos: p.comodatos.length,
    },
    // Primeiro no objeto porque é o que responde "compra o quê" — e o que
    // sobra se algum corte ainda acontecer lá na frente.
    mix: p.mix.slice(0, MIX_NO_RESUMO).map((m) => ({
      codigoErp: m.codigoErp,
      descricao: m.descricao,
      unidade: m.unidade,
      ultimaCompra: dia(m.ultimaCompra),
      ultimoPreco: m.ultimoPrecoUnitario,
      ultimoDesconto: m.ultimoDesconto,
      precoTabela: m.precoTabela,
    })),
    mixTruncado: p.mix.length > MIX_NO_RESUMO,
    titulos: {
      emAberto: abertos.length,
      vencidos: vencidos.length,
      vencidosDetalhe: vencidos.slice(0, 5).map((t) => ({
        numero: t.numero,
        parcela: t.parcela,
        vencimento: dia(t.vencimento),
        saldo: t.saldo,
      })),
    },
    ultimasNotas: p.notas.slice(0, 5).map((n) => ({
      numero: n.numero,
      dtEmissao: dia(n.dtEmissao),
      vlrBruto: n.vlrBruto,
    })),
  };
}

@Injectable()
export class AgenteToolsService {
  constructor(
    private readonly consultas: ConsultasService,
    private readonly clientes: ClientesService,
    private readonly produtos: ProdutosService,
    private readonly orcamentos: OrcamentosService,
    private readonly titulos: TitulosReceberService,
    private readonly sugestao: SugestaoCompraService,
    private readonly objetivos: ObjetivosService,
    private readonly enriquecimento: EnriquecimentoService,
  ) {}

  private todas(): Ferramenta[] {
    return [
      {
        nome: 'buscar_cliente',
        descricao:
          'Busca e CONTA clientes da carteira do usuário. Filtra por nome/código, ' +
          'ramo de atividade (CNAE), situação (ativo/inativo), município e UF. ' +
          'Devolve `total` — a contagem da consulta inteira, não da página —, ' +
          'então use esta ferramenta para responder "quantos clientes eu tenho", ' +
          '"quantos ativos" ou "quantos em tal cidade", combinando os filtros. ' +
          'A lista traz só os primeiros; o total vale sempre.',
        permissao: 'clientes.visualizar',
        exemplos: [
          'Quantos clientes ativos eu tenho?',
          'Quais clientes meus ficam em Campo Grande?',
          'Liste meus clientes do ramo de restaurantes',
        ],
        limiteItens: 25,
        parametros: {
          type: 'object',
          properties: {
            busca: {
              type: 'string',
              description: 'Nome, razão social ou código',
            },
            ativo: {
              type: 'boolean',
              description:
                'true = só ativos, false = só inativos. Omitido = os dois.',
            },
            municipio: {
              type: 'string',
              description:
                'Nome do município, inteiro (ex.: "Campo Grande"). Não aceita parte do nome.',
            },
            uf: { type: 'string', description: 'Sigla de 2 letras (ex.: MS)' },
            cnae: {
              type: 'string',
              description:
                'Prefixo do código CNAE, de 2 a 7 dígitos. O código é hierárquico: ' +
                '"56" = alimentação, "5611" = restaurantes/bares/lanchonetes ' +
                '(food service), "5611201" = só restaurantes. Prefira o prefixo ' +
                'curto quando a pergunta for sobre o ramo em geral.',
            },
          },
        },
        executar: async (a, user) =>
          resumirClientes(
            (await this.clientes.findAll(user.empresaAtivaId, user, {
              page: 1,
              // Filtro de ramo costuma ser "liste meus clientes do tipo X", e 10
              // linhas cortariam a resposta cedo demais.
              pageSize: texto(a.cnae) ? 25 : 10,
              search: texto(a.busca),
              ...(texto(a.cnae) ? { cnae: texto(a.cnae) } : {}),
              ...(typeof a.ativo === 'boolean' ? { ativo: a.ativo } : {}),
              ...(texto(a.municipio) ? { municipio: texto(a.municipio) } : {}),
              ...(texto(a.uf) ? { uf: texto(a.uf).toUpperCase() } : {}),
              sortOrder: 'asc',
            } as never)) as unknown as ClientePaginado,
          ),
        // Um resultado só abre o cadastro dele; vários abrem a lista, porque
        // apontar para um dos dez seria escolher por quem perguntou.
        destino: (a, r) => {
          const id = primeiroId(r, 'clientes');
          if (id) {
            return {
              rotulo: 'Abrir o cliente',
              rota: `/cadastros/clientes/${id}`,
            };
          }
          return {
            rotulo: 'Ver na lista de Clientes',
            rota: rotaComFiltros('/cadastros/clientes', {
              search: texto(a.busca),
              cnae: texto(a.cnae),
              municipio: texto(a.municipio),
              uf: texto(a.uf).toUpperCase(),
              ativo: typeof a.ativo === 'boolean' ? a.ativo : undefined,
            }),
          };
        },
      },
      {
        nome: 'verificar_cliente_na_base',
        descricao:
          'Verifica se uma empresa JÁ É CLIENTE da casa e de qual vendedor ela é, ' +
          'inclusive fora da carteira do usuário. Use quando perguntarem se um ' +
          'cliente já existe, se já é atendido, ou de quem ele é — típico antes de ' +
          'prospectar. Devolve apenas identificação e o vendedor responsável: ' +
          'nada de valores, títulos ou histórico de quem está fora da carteira. ' +
          'Para consultar dados do cliente, use buscar_cliente.',
        permissao: 'clientes.visualizar',
        exemplos: ['A empresa X já é cliente da casa? De quem ela é?'],
        parametros: {
          type: 'object',
          properties: {
            busca: {
              type: 'string',
              description: 'Nome, CNPJ ou código. Mínimo 3 caracteres.',
            },
          },
          required: ['busca'],
        },
        executar: (a, user) =>
          this.clientes.verificarTitularidade(
            user.empresaAtivaId,
            user,
            texto(a.busca),
          ),
      },
      {
        nome: 'buscar_produto',
        descricao: 'Busca produtos do catálogo por descrição ou código.',
        permissao: 'produtos.visualizar',
        exemplos: ['Tem detergente no catálogo? Qual o código?'],
        parametros: {
          type: 'object',
          properties: { busca: { type: 'string' } },
          required: ['busca'],
        },
        executar: (a, user) =>
          this.produtos.findAll(user.empresaAtivaId, {
            page: 1,
            pageSize: 10,
            search: texto(a.busca),
            sortOrder: 'asc',
          } as never),
        destino: (_a, r) => {
          const id = primeiroId(r);
          return id
            ? { rotulo: 'Abrir o produto', rota: `/comercial/produtos/${id}` }
            : { rotulo: 'Abrir Produtos', rota: '/comercial/produtos' };
        },
      },
      {
        nome: 'posicao_cliente',
        descricao:
          'Posição de um cliente: mix de produtos que ele compra (com data da ' +
          'última compra, preço praticado e preço de tabela), total comprado, ' +
          'títulos em aberto e vencidos, últimas notas e comodatos. Use para ' +
          'responder "o que este cliente compra" e "como ele está".',
        permissao: 'posicao-cliente.visualizar',
        exemplos: [
          'O que o cliente X compra?',
          'Como está o cliente X — comprou quanto, deve alguma coisa?',
        ],
        limiteItens: POSICAO_LIMITE_ITENS,
        parametros: {
          type: 'object',
          properties: { clienteId: { type: 'string' } },
          required: ['clienteId'],
        },
        executar: async (a, user) =>
          resumirPosicao(
            (await this.clientes.posicao(
              user.empresaAtivaId,
              user,
              texto(a.clienteId),
            )) as unknown as PosicaoBruta,
          ),
        // O resumo do chat mostra 20 produtos do mix e 5 notas; a tela mostra
        // o histórico inteiro, que é justamente o que não coube.
        destino: (a) => ({
          rotulo: 'Ver a posição completa',
          rota: `/comercial/posicao-cliente/${texto(a.clienteId)}`,
        }),
      },
      {
        nome: 'sugerir_compras',
        descricao:
          'Sugere produtos para um cliente com base no que clientes semelhantes ' +
          '(mesmo ramo/CNAE e cesta de compras parecida) compram e ele não. ' +
          'Devolve a evidência: quantos semelhantes compram e o ticket médio.',
        permissao: 'sugestao-compra.visualizar',
        exemplos: ['O que eu posso oferecer para o cliente X?'],
        parametros: {
          type: 'object',
          properties: {
            clienteId: { type: 'string' },
            limite: {
              type: 'number',
              description: 'Quantos produtos (padrão 10)',
            },
          },
          required: ['clienteId'],
        },
        executar: (a, user) =>
          this.sugestao.paraCliente(
            user.empresaAtivaId,
            user,
            texto(a.clienteId),
            {
              meses: 12,
              limite: numero(a.limite, 10),
              semelhantes: 30,
              baseSemelhanca: 'ambos',
              afinidadeCnae: 'hierarquica',
            },
          ),
        destino: () => ({
          rotulo: 'Abrir Sugestão de compra',
          rota: '/consultas/sugestao-compra',
        }),
      },
      {
        nome: 'titulos_em_aberto',
        descricao:
          'Títulos a receber em aberto, com vencidos e a vencer. Aceita filtro por cliente.',
        permissao: 'titulos-receber.visualizar',
        exemplos: ['Quais clientes meus têm título vencido?'],
        parametros: {
          type: 'object',
          properties: { clienteId: { type: 'string' } },
        },
        executar: (a, user) =>
          this.titulos.findAll(user.empresaAtivaId, user, {
            page: 1,
            pageSize: 20,
            sortOrder: 'asc',
            ...(texto(a.clienteId) ? { clienteId: texto(a.clienteId) } : {}),
          } as never),
        destino: () => ({
          rotulo: 'Abrir Títulos a receber',
          rota: '/comercial/titulos-receber',
        }),
      },
      {
        nome: 'listar_orcamentos',
        descricao:
          'Lista orçamentos da carteira, com filtro opcional por cliente.',
        permissao: 'orcamentos.visualizar',
        exemplos: ['Quais orçamentos eu tenho em aberto?'],
        parametros: {
          type: 'object',
          properties: { clienteId: { type: 'string' } },
        },
        executar: (a, user) =>
          this.orcamentos.findAll(user.empresaAtivaId, user, {
            page: 1,
            pageSize: 20,
            sortOrder: 'desc',
            ...(texto(a.clienteId) ? { clienteId: texto(a.clienteId) } : {}),
          } as never),
        destino: () => ({
          rotulo: 'Abrir Orçamentos',
          rota: '/crm/orcamentos',
        }),
      },
      {
        nome: 'vendas_por_cliente',
        descricao:
          'Vendas do período somadas mês a mês por cliente. Informe ano/mês inicial e final ' +
          '(máximo 12 meses).',
        permissao: 'consulta-vendas-cliente.visualizar',
        exemplos: ['Quanto o cliente X comprou nos últimos 6 meses?'],
        parametros: {
          type: 'object',
          properties: {
            anoInicial: { type: 'number' },
            mesInicial: { type: 'number' },
            anoFinal: { type: 'number' },
            mesFinal: { type: 'number' },
          },
          required: ['anoInicial', 'mesInicial', 'anoFinal', 'mesFinal'],
        },
        executar: (a, user) =>
          this.consultas.vendasPorCliente(user.empresaAtivaId, user, {
            anoInicial: numero(a.anoInicial, new Date().getFullYear()),
            mesInicial: numero(a.mesInicial, 1),
            anoFinal: numero(a.anoFinal, new Date().getFullYear()),
            mesFinal: numero(a.mesFinal, 12),
          }),
        destino: () => ({
          rotulo: 'Abrir Vendas por cliente',
          rota: '/consultas/vendas-cliente',
        }),
      },
      {
        nome: 'vendas_por_produto',
        descricao:
          'Vendas do período somadas mês a mês por produto (máximo 12 meses).',
        permissao: 'consulta-vendas-produto.visualizar',
        exemplos: ['Quais produtos mais venderam de janeiro a junho?'],
        parametros: {
          type: 'object',
          properties: {
            anoInicial: { type: 'number' },
            mesInicial: { type: 'number' },
            anoFinal: { type: 'number' },
            mesFinal: { type: 'number' },
          },
          required: ['anoInicial', 'mesInicial', 'anoFinal', 'mesFinal'],
        },
        executar: (a, user) =>
          this.consultas.vendasPorProduto(user.empresaAtivaId, user, {
            anoInicial: numero(a.anoInicial, new Date().getFullYear()),
            mesInicial: numero(a.mesInicial, 1),
            anoFinal: numero(a.anoFinal, new Date().getFullYear()),
            mesFinal: numero(a.mesFinal, 12),
          }),
        destino: () => ({
          rotulo: 'Abrir Vendas por produto',
          rota: '/consultas/vendas-produto',
        }),
      },
      {
        nome: 'execucao_objetivos',
        descricao:
          'Execução das metas de um mês (Dashboard Comercial): objetivo x realizado ' +
          'em valor e em número de clientes positivados, percentuais, devoluções e ' +
          'a quebra por categoria de produto. Sem vendedorId, agrega todo o escopo ' +
          'do usuário. Use para "como foi a execução de objetivos de MM/AAAA".',
        permissao: 'dashboard-comercial.visualizar',
        exemplos: [
          'Como foi a execução de objetivos de julho?',
          'Bati a meta do mês passado?',
        ],
        limiteItens: 25,
        parametros: {
          type: 'object',
          properties: {
            mes: { type: 'number', description: '1 a 12' },
            ano: { type: 'number' },
            vendedorId: {
              type: 'string',
              description: 'Opcional. Omitido = todo o escopo do usuário.',
            },
            municipio: {
              type: 'string',
              description:
                'Opcional. Recorta o realizado; a meta não é por município.',
            },
          },
          required: ['mes', 'ano'],
        },
        executar: (a, user) =>
          this.objetivos.dashboard(user.empresaAtivaId, user, {
            mes: numero(a.mes, new Date().getMonth() + 1),
            ano: numero(a.ano, new Date().getFullYear()),
            ...(texto(a.vendedorId) ? { vendedorId: texto(a.vendedorId) } : {}),
            ...(texto(a.municipio) ? { municipio: texto(a.municipio) } : {}),
          }),
        destino: () => ({
          rotulo: 'Abrir o Dashboard Comercial',
          rota: '/comercial/dashboard',
        }),
      },
      {
        nome: 'consultar_cnpj',
        descricao:
          'Consulta um CNPJ na base pública da Receita Federal e devolve o ramo ' +
          '(CNAEs), a situação cadastral e o município. Não grava nada e não ' +
          'devolve razão social nem contato — para saber se o CNPJ já é cliente, ' +
          'use verificar_cliente_na_base.',
        permissao: 'clientes.visualizar',
        exemplos: ['Qual o ramo da empresa do CNPJ 12.345.678/0001-99?'],
        parametros: {
          type: 'object',
          properties: {
            cnpj: {
              type: 'string',
              description: '14 dígitos, com ou sem máscara',
            },
          },
          required: ['cnpj'],
        },
        executar: async (a, user) => {
          void user;
          const r = await this.enriquecimento.consultarCnpj(texto(a.cnpj));
          // Recorte deliberado: nome, endereço, telefone e e-mail da empresa
          // consultada não vão ao provedor, pela mesma razão que os do
          // cadastro não vão (ver `anonimizar-agente.ts`). O que responde a
          // pergunta é o ramo.
          return {
            situacaoCadastral: r.situacaoCadastral,
            municipio: r.municipio,
            uf: r.uf,
            cnaes: r.cnaes.map((c) => ({
              codigo: c.codigo,
              descricao: c.descricao,
              principal: c.principal,
              naReferencia: !!c.cnaeId,
            })),
          };
        },
      },
      // ---- escrita: não executa direto, vira pendência de confirmação ----
      {
        nome: 'atualizar_cadastro_pela_receita',
        descricao:
          'Atualiza o cadastro de UM cliente a partir do CNPJ dele na base da ' +
          'Receita Federal: ramo (CNAEs), razão social, endereço e contato. ' +
          'Nada entra no cadastro sem passar por gente — o usuário confirma aqui ' +
          'e a alteração vai para a fila de aprovação, onde o responsável escolhe ' +
          'campo a campo o que aplicar. A única exceção é o cliente sem nenhum ' +
          'CNAE, cujo ramo é preenchido na hora. Para vários clientes, chame uma ' +
          'vez por cliente.',
        permissao: 'clientes.editar',
        exemplos: [
          'Atualize o cadastro do cliente X pela Receita Federal',
          'Traga o ramo (CNAE) do cliente X',
        ],
        escrita: true,
        resumir: () =>
          'Consultar a Receita Federal e enviar o cadastro do cliente para aprovação',
        parametros: {
          type: 'object',
          properties: { clienteId: { type: 'string' } },
          required: ['clienteId'],
        },
        executar: (a, user) =>
          this.clientes.atualizarPelaReceita(
            user.empresaAtivaId,
            user,
            texto(a.clienteId),
          ),
        // Dois caminhos porque são duas perguntas diferentes: "o que ele quer
        // mudar no cadastro?" (fila) e "como está o cliente hoje?" (cadastro).
        // A fila só entra quando há mesmo o que aprovar.
        destino: (a, r) => {
          const saida = r as { solicitacaoId?: string | null } | null;
          const cliente: Destino = {
            rotulo: 'Abrir o cliente',
            rota: `/cadastros/clientes/${texto(a.clienteId)}`,
          };
          return saida?.solicitacaoId
            ? [
                {
                  rotulo: 'Revisar e aprovar as alterações',
                  rota: '/cadastros/clientes-alteracoes',
                },
                cliente,
              ]
            : cliente;
        },
      },
      {
        nome: 'criar_orcamento',
        descricao:
          'Cria um orçamento para um cliente. NÃO grava imediatamente: o usuário ' +
          'precisa confirmar na tela. Informe clienteId, título e os itens ' +
          '(produtoId e quantidade).',
        permissao: 'orcamentos.cadastrar',
        exemplos: [
          'Monte um orçamento para o cliente X com 10 caixas do produto Y',
        ],
        escrita: true,
        resumir: (a) => {
          const itens = Array.isArray(a.itens) ? a.itens : [];
          return `Orçamento "${texto(a.titulo) || 'sem título'}" com ${itens.length} item(ns)`;
        },
        parametros: {
          type: 'object',
          properties: {
            clienteId: { type: 'string' },
            titulo: { type: 'string' },
            itens: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  produtoId: { type: 'string' },
                  quantidade: { type: 'number' },
                },
                required: ['produtoId', 'quantidade'],
              },
            },
          },
          required: ['clienteId', 'titulo', 'itens'],
        },
        executar: (a, user) =>
          this.orcamentos.create(user.empresaAtivaId, user, a as never),
        destino: (_a, r) => {
          const id = (r as { id?: unknown })?.id;
          return typeof id === 'string'
            ? { rotulo: 'Abrir o orçamento', rota: `/crm/orcamentos/${id}` }
            : { rotulo: 'Abrir Orçamentos', rota: '/crm/orcamentos' };
        },
      },
    ];
  }

  private permitida(f: Ferramenta, user: AuthenticatedUser): boolean {
    return user.isAdmin || user.permissoes.includes(f.permissao);
  }

  /**
   * Metadados do catálogo, sem as funções. Alimenta a tela de configuração e o
   * serviço de governança, que precisam saber o que existe — não executá-lo.
   */
  catalogo() {
    return this.todas().map((f) => ({
      chave: f.nome,
      nome: f.nome,
      descricao: f.descricao,
      permissao: f.permissao,
      escrita: !!f.escrita,
    }));
  }

  /**
   * A configuração da empresa **restringe** o que a permissão já liberou.
   *
   * A ordem importa: `permitida` continua sendo a última palavra. Desligar uma
   * ferramenta ou limitá-la a perfis tira acesso; nada aqui devolve acesso que
   * o RBAC negou.
   */
  private liberadaPelaConfig(
    f: Ferramenta,
    filtro: FiltroFerramentas | undefined,
    user: AuthenticatedUser,
  ): boolean {
    // Sem configuração carregada (chamada interna, empresa ainda não
    // sincronizada), vale o catálogo puro — o comportamento anterior.
    const cfg = filtro?.config.get(f.nome);
    if (!cfg) return true;

    // Desligada vale para todos, inclusive o administrador: o interruptor diz
    // que a capacidade não existe nesta empresa, e abrir exceção aqui faria o
    // admin testar um agente diferente do que a equipe usa.
    if (!cfg.ativa) return false;

    // O **Administrador** ignora a restrição por perfil, sempre. É quem
    // configura a lista, e precisa conseguir testar o que acabou de restringir
    // sem ter de se incluir em cada ferramenta.
    if (user.isAdmin) return true;

    // Lista de perfis vazia = sem restrição por perfil.
    if (cfg.perfilIds.length === 0) return true;
    return !!filtro?.perfilId && cfg.perfilIds.includes(filtro.perfilId);
  }

  /** Só o que o usuário pode fazer — é este recorte que vai para o modelo. */
  disponiveisPara(
    user: AuthenticatedUser,
    filtro?: FiltroFerramentas,
  ): Ferramenta[] {
    return this.todas().filter(
      (f) =>
        this.permitida(f, user) && this.liberadaPelaConfig(f, filtro, user),
    );
  }

  paraProvedor(
    user: AuthenticatedUser,
    filtro?: FiltroFerramentas,
  ): FerramentaChat[] {
    return this.disponiveisPara(user, filtro).map((f) => {
      const cfg = filtro?.config.get(f.nome);
      return {
        // O nome continua sendo a chave: renomeá-lo mudaria o `tool_call` que
        // o modelo devolve e quebraria o `buscar()` na volta.
        nome: f.nome,
        // A descrição, sim, é reescrevível — é ela que ensina o modelo *quando*
        // usar a ferramenta, e esse vocabulário muda com a operação.
        descricao: cfg?.descricao || f.descricao,
        parametros: f.parametros,
      };
    });
  }

  buscar(nome: string): Ferramenta | undefined {
    return this.todas().find((f) => f.nome === nome);
  }

  /**
   * Segunda trava. Chamada antes de qualquer execução, inclusive na
   * confirmação de uma pendência — a permissão pode ter sido revogada entre a
   * proposta e o clique em Confirmar.
   */
  garantirPermissao(f: Ferramenta, user: AuthenticatedUser): void {
    if (!this.permitida(f, user)) {
      throw new ForbiddenException(
        `Usuário não possui a permissão ${f.permissao} exigida por ${f.nome}`,
      );
    }
  }

  async executar(
    nome: string,
    args: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<unknown> {
    const ferramenta = this.buscar(nome);
    if (!ferramenta) {
      // Modelo alucinou um nome de ferramenta: o erro volta como resultado
      // para ele se corrigir, em vez de derrubar a conversa.
      throw new ForbiddenException(`Ferramenta desconhecida: ${nome}`);
    }
    this.garantirPermissao(ferramenta, user);
    return ferramenta.executar(args, user);
  }
}
