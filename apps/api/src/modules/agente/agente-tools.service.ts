import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConsultasService } from '../consultas/consultas.service';
import { ClientesService } from '../clientes/clientes.service';
import { ProdutosService } from '../produtos/produtos.service';
import { OrcamentosService } from '../orcamentos/orcamentos.service';
import { TitulosReceberService } from '../titulos-receber/titulos-receber.service';
import { SugestaoCompraService } from '../sugestao-compra/sugestao-compra.service';
import { ObjetivosService } from '../objetivos/objetivos.service';
import { EnriquecimentoService } from '../clientes/enriquecimento.service';
import { AtividadesService } from '../atividades/atividades.service';
import { OportunidadesService } from '../oportunidades/oportunidades.service';
import { WhatsappConversasService } from '../whatsapp/whatsapp-conversas.service';
import { WhatsappAcoesService } from '../whatsapp/whatsapp-acoes.service';
import { WhatsappAgendamentoService } from '../whatsapp/whatsapp-agendamento.service';
import { VendedoresService } from '../vendedores/vendedores.service';
import { MeusAtendimentosService } from '../meus-atendimentos/meus-atendimentos.service';
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
  /**
   * Só existe para quem tem WhatsApp pareado (ver `FiltroFerramentas`).
   *
   * Não substitui a `permissao`: soma-se a ela. A permissão diz que o usuário
   * *pode* atender por WhatsApp; isto diz que ele *tem* aparelho vinculado —
   * sem o qual a ferramenta não tem de onde ler nem por onde falar.
   */
  exigeWhatsapp?: boolean;
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

/** O que a projeção do histórico usa de cada fonte — os payloads trazem mais. */
interface AtividadeResumo {
  titulo: string;
  tipo: string;
  dataVencimento: Date | null;
  concluida: boolean;
}
interface OportunidadeResumo {
  id: string;
  titulo: string;
  estagio: string;
  valorPrevisto: number | null;
  dataPrevisao: Date | null;
}

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

/**
 * Valores que o modelo pode mandar nos campos de enum. Fora da lista, cai no
 * padrão em vez de estourar validação: um "tipo: chamada" (em vez de
 * "ligacao") não deve impedir o compromisso de existir.
 */
const TIPOS_ATIVIDADE = new Set([
  'ligacao',
  'reuniao',
  'email',
  'visita',
  'tarefa',
]);
const ESTAGIOS = new Set([
  'prospeccao',
  'qualificacao',
  'proposta',
  'negociacao',
  'ganha',
  'perdida',
]);

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
    private readonly atividades: AtividadesService,
    private readonly oportunidades: OportunidadesService,
    private readonly conversas: WhatsappConversasService,
    private readonly vendedores: VendedoresService,
    private readonly whatsappAcoes: WhatsappAcoesService,
    private readonly agendamento: WhatsappAgendamentoService,
    private readonly meusAtendimentos: MeusAtendimentosService,
  ) {}

  /**
   * Até onde o agente enxerga: **o mesmo que as telas daquele usuário**.
   *
   * | Quem | Alcance no chat |
   * |---|---|
   * | Vendedor | só a própria carteira |
   * | Supervisor, gerente | a própria e a dos subordinados |
   * | Diretor, administrador, usuário sem cadastro de vendedor | a empresa |
   *
   * Foi mais estreito até 2026-09-02: supervisor também respondia só pela
   * carteira própria. A regra caiu quando ficou claro que supervisor e gerente
   * **trabalham na carteira dos subordinados** — atendem, orçam e cobram por
   * eles. Com o corte antigo, o agente respondia "você não tem clientes" a
   * quem atende a equipe inteira, e recusava agendar visita ao cliente que ele
   * acabara de visitar.
   *
   * Só o vendedor "puro" ganha filtro explícito aqui, e mesmo esse é defesa em
   * profundidade: `resolverEscopoVendedores`, dentro de cada service, já
   * aplica o mesmo recorte. Para os demais devolve `{}` — sem recorte extra,
   * valendo o escopo do service e a RLS da empresa ativa. O filtro
   * **restringe**, nunca amplia.
   *
   * **O WhatsApp não segue esta regra**: conversa e mensagem continuam
   * limitadas à própria conexão para todo mundo (ver `conversas_whatsapp` e
   * `historicoDoClienteNaPropriaConexao`). Ler o atendimento da equipe na tela
   * é uma coisa; mandar o texto dele para o provedor de IA é outra.
   */
  private async filtroCarteira(
    user: AuthenticatedUser,
  ): Promise<{ vendedorId?: string }> {
    // `isAdmin` cobre Administrador e Diretor — ver `resolverEscopoVendedores`.
    if (user.isAdmin) return {};
    const vendedor = await this.vendedores.vendedorDoUsuario(
      user.empresaAtivaId,
      user,
    );
    // Sem cadastro de vendedor (administrativo, financeiro) o alcance é o
    // mesmo das telas dele: a empresa ativa.
    if (!vendedor || vendedor.tipo !== 'vendedor') return {};
    return { vendedorId: vendedor.id };
  }

  /** Mesmo recorte, no formato que as Consultas de venda aceitam. */
  private async filtroCarteiraConsulta(
    user: AuthenticatedUser,
  ): Promise<{ vendedorIds?: string[] }> {
    const { vendedorId } = await this.filtroCarteira(user);
    return vendedorId ? { vendedorIds: [vendedorId] } : {};
  }

  /**
   * O cliente está no alcance de quem perguntou?
   *
   * `findOne` já barra o que está fora do escopo do service, e desde
   * 2026-09-02 o agente usa esse mesmo escopo (ver `filtroCarteira`) — então
   * para supervisor, gerente, diretor e administrador não há o que comparar
   * aqui. Sobra o vendedor "puro": a checagem é a rede que impede o modelo de
   * agir sobre um id de cliente que ele pescou numa listagem alheia.
   */
  private async garantirClienteNoAlcance(
    user: AuthenticatedUser,
    clienteId: string,
  ) {
    const { vendedorId } = await this.filtroCarteira(user);
    const cliente = (await this.clientes.findOne(
      user.empresaAtivaId,
      user,
      clienteId,
    )) as { vendedorId: string | null };
    if (vendedorId && cliente.vendedorId !== vendedorId) {
      throw new ForbiddenException(
        'Este cliente é de outra carteira. O assistente responde sobre os ' +
          'clientes que são seus.',
      );
    }
  }

  /**
   * A oportunidade é de quem está pedindo para mexer nela?
   *
   * `update` já barra o que está fora do escopo do service, e o agente usa o
   * mesmo escopo desde 2026-09-02 — supervisor e gerente mexem no funil da
   * equipe aqui como mexem na tela. A checagem sobra para o vendedor "puro":
   * escrever no atendimento do colega é pior do que lê-lo.
   */
  private async garantirOportunidadeNoAlcance(
    user: AuthenticatedUser,
    oportunidadeId: string,
  ) {
    const { vendedorId } = await this.filtroCarteira(user);
    if (!vendedorId) return;
    const oportunidade = (await this.oportunidades.findOne(
      user.empresaAtivaId,
      user,
      oportunidadeId,
    )) as { vendedorId: string | null };
    if (oportunidade.vendedorId !== vendedorId) {
      throw new ForbiddenException(
        'Esta oportunidade é de outro vendedor. O assistente mexe apenas no ' +
          'que é seu.',
      );
    }
  }

  /**
   * Onde a conversa com este cliente parou — CRM e WhatsApp no mesmo lugar.
   *
   * As três fontes têm regras de acesso **diferentes**, e é por isso que cada
   * uma vem do seu próprio service em vez de uma consulta só: atividades e
   * oportunidades seguem o escopo de carteira; o WhatsApp segue o escopo de
   * **sessão** (ver `WhatsappConversasService`) — ter o cliente na carteira não
   * dá direito de ler a conversa que outro vendedor teve com ele.
   *
   * Do WhatsApp sai o mínimo que responde "onde paramos": quantas conversas,
   * quando foi a última mensagem e a prévia dela — a mesma prévia que já
   * aparece na lista de atendimento. O rolo completo fica na tela, que é para
   * onde o botão da resposta leva.
   */
  private async historicoAtendimento(
    user: AuthenticatedUser,
    clienteId: string,
  ) {
    const empresaId = user.empresaAtivaId;
    // O cliente estar no alcance não faz da agenda do colega assunto de quem
    // pergunta: para vendedor e supervisor, só o que é da própria carteira.
    const carteira = await this.filtroCarteira(user);
    const [agenda, funil, whatsapp] = await Promise.all([
      this.atividades.findAll(empresaId, user, {
        ...carteira,
        page: 1,
        pageSize: 10,
        clienteId,
        sortBy: 'dataVencimento',
        sortOrder: 'desc',
      } as never) as Promise<{ data: AtividadeResumo[]; total: number }>,
      this.oportunidades.findAll(empresaId, user, {
        ...carteira,
        page: 1,
        pageSize: 10,
        clienteId,
        sortOrder: 'desc',
      } as never) as Promise<{ data: OportunidadeResumo[]; total: number }>,
      this.conversas.historicoDoClienteNaPropriaConexao(
        empresaId,
        user,
        clienteId,
      ),
    ]);

    return {
      whatsapp,
      agenda: {
        total: agenda.total,
        itens: agenda.data.map((a) => ({
          titulo: a.titulo,
          tipo: a.tipo,
          quando: dia(a.dataVencimento),
          concluida: a.concluida,
        })),
      },
      funil: {
        total: funil.total,
        itens: funil.data.map((o) => ({
          id: o.id,
          titulo: o.titulo,
          estagio: o.estagio,
          valorPrevisto: o.valorPrevisto,
          previsao: dia(o.dataPrevisao),
        })),
      },
    };
  }

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
              // Trava na carteira de quem pergunta — ver .
              ...(await this.filtroCarteira(user)),
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
        executar: async (a, user) => {
          await this.garantirClienteNoAlcance(user, texto(a.clienteId));
          return resumirPosicao(
            (await this.clientes.posicao(
              user.empresaAtivaId,
              user,
              texto(a.clienteId),
            )) as unknown as PosicaoBruta,
          );
        },
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
        executar: async (a, user) => {
          await this.garantirClienteNoAlcance(user, texto(a.clienteId));
          return this.sugestao.paraCliente(
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
          );
        },
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
        executar: async (a, user) =>
          this.titulos.findAll(user.empresaAtivaId, user, {
            // Recorte por perfil — ver `filtroCarteira`.
            ...(await this.filtroCarteira(user)),
            page: 1,
            pageSize: 20,
            sortOrder: 'asc',
            ...(texto(a.clienteId) ? { clienteId: texto(a.clienteId) } : {}),
          } as never),
        destino: (a) => ({
          rotulo: 'Abrir Títulos a receber',
          rota: rotaComFiltros('/comercial/titulos-receber', {
            clienteId: texto(a.clienteId),
            // A ferramenta lista o que está em aberto; a tela abre no mesmo
            // recorte em vez de mostrar tudo, inclusive o já baixado.
            status: 'aberto',
          }),
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
        executar: async (a, user) =>
          this.orcamentos.findAll(user.empresaAtivaId, user, {
            // Recorte por perfil — ver `filtroCarteira`.
            ...(await this.filtroCarteira(user)),
            page: 1,
            pageSize: 20,
            sortOrder: 'desc',
            ...(texto(a.clienteId) ? { clienteId: texto(a.clienteId) } : {}),
          } as never),
        destino: (a) => ({
          rotulo: 'Abrir Orçamentos',
          rota: rotaComFiltros('/crm/orcamentos', {
            clienteId: texto(a.clienteId),
          }),
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
        executar: async (a, user) =>
          this.consultas.vendasPorCliente(user.empresaAtivaId, user, {
            // O total do período é o **meu** total: sem isto, a mesma pergunta
            // devolveria o agregado da equipe para o supervisor.
            ...(await this.filtroCarteiraConsulta(user)),
            anoInicial: numero(a.anoInicial, new Date().getFullYear()),
            mesInicial: numero(a.mesInicial, 1),
            anoFinal: numero(a.anoFinal, new Date().getFullYear()),
            mesFinal: numero(a.mesFinal, 12),
          }),
        destino: (a) => ({
          rotulo: 'Abrir Vendas por cliente',
          rota: rotaComFiltros('/consultas/vendas-cliente', {
            anoInicial: numero(a.anoInicial, 0) || undefined,
            mesInicial: numero(a.mesInicial, 0) || undefined,
            anoFinal: numero(a.anoFinal, 0) || undefined,
            mesFinal: numero(a.mesFinal, 0) || undefined,
          }),
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
        executar: async (a, user) =>
          this.consultas.vendasPorProduto(user.empresaAtivaId, user, {
            ...(await this.filtroCarteiraConsulta(user)),
            anoInicial: numero(a.anoInicial, new Date().getFullYear()),
            mesInicial: numero(a.mesInicial, 1),
            anoFinal: numero(a.anoFinal, new Date().getFullYear()),
            mesFinal: numero(a.mesFinal, 12),
          }),
        destino: (a) => ({
          rotulo: 'Abrir Vendas por produto',
          rota: rotaComFiltros('/consultas/vendas-produto', {
            anoInicial: numero(a.anoInicial, 0) || undefined,
            mesInicial: numero(a.mesInicial, 0) || undefined,
            anoFinal: numero(a.anoFinal, 0) || undefined,
            mesFinal: numero(a.mesFinal, 0) || undefined,
          }),
        }),
      },
      {
        nome: 'execucao_objetivos',
        descricao:
          'A SUA execução de metas em um mês: objetivo x realizado em valor e em ' +
          'clientes positivados, percentuais, devoluções e a quebra por categoria. ' +
          'Responde sempre pela carteira de quem está perguntando — não existe ' +
          'consulta de meta de outro vendedor, da equipe ou da empresa por aqui; ' +
          'isso é o Dashboard Comercial, na tela.',
        permissao: 'dashboard-comercial.visualizar',
        exemplos: [
          'Como foi a minha execução de objetivos em julho?',
          'Bati a minha meta do mês passado?',
        ],
        limiteItens: 25,
        parametros: {
          type: 'object',
          properties: {
            mes: { type: 'number', description: '1 a 12' },
            ano: { type: 'number' },
            municipio: {
              type: 'string',
              description:
                'Opcional. Recorta o realizado; a meta não é por município.',
            },
          },
          required: ['mes', 'ano'],
        },
        executar: async (a, user) =>
          this.objetivos.dashboard(user.empresaAtivaId, user, {
            mes: numero(a.mes, new Date().getMonth() + 1),
            ano: numero(a.ano, new Date().getFullYear()),
            // Sempre o próprio vendedor: omitir agregaria o escopo — a equipe,
            // para o supervisor, e a empresa, para o administrador.
            ...(await this.filtroCarteira(user)),
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
      {
        nome: 'resumo_atendimentos',
        descricao:
          'O que o usuário fez no período: conversas de WhatsApp, 2ª via de ' +
          'boleto e DANFE, títulos e notas enviados, orçamentos e compromissos ' +
          'da agenda — tudo em ordem, com o cliente de cada um. Aceita de 1 a 7 ' +
          'dias (1 = hoje) e filtro por cliente. Use para "o que eu fiz hoje", ' +
          '"resuma minha semana" e "o que eu já fiz para o cliente X". Com ' +
          '`escopo: "equipe"`, traz o que os subordinados fizeram — só responde ' +
          'assim para quem tem equipe; para os demais volta o próprio.',
        permissao: 'meus-atendimentos.visualizar',
        limiteItens: 30,
        exemplos: [
          'O que eu fiz hoje?',
          'Faça um resumo dos meus atendimentos dos últimos 7 dias',
          'O que eu já fiz para o cliente X esta semana?',
          'O que a minha equipe fez esta semana?',
        ],
        parametros: {
          type: 'object',
          properties: {
            dias: {
              type: 'number',
              description: 'De 1 (hoje) a 7. Padrão: 1.',
            },
            clienteId: {
              type: 'string',
              description: 'Só o que foi feito para este cliente',
            },
            escopo: {
              type: 'string',
              description:
                '"proprio" (padrão) ou "equipe" — o atendimento dos subordinados',
            },
          },
        },
        executar: async (a, user) => {
          if (texto(a.clienteId)) {
            await this.garantirClienteNoAlcance(user, texto(a.clienteId));
          }
          return this.meusAtendimentos.resumo(user.empresaAtivaId, user, {
            // O teto de 7 dias é do contrato, e o modelo erra o número: pedir
            // "o mês" viraria 400 em vez de resposta.
            dias: Math.min(Math.max(Math.round(numero(a.dias, 1)), 1), 7),
            // Quem não tem equipe recebe o próprio de volta — o service decide,
            // então "equipe" nunca vira alcance que a hierarquia não dá.
            escopo: texto(a.escopo) === 'equipe' ? 'equipe' : 'proprio',
            // O chat resume; a lista inteira fica na tela. 40 registros é o que
            // o modelo consegue sintetizar sem a resposta virar inventário.
            limite: 40,
            ...(texto(a.clienteId) ? { clienteId: texto(a.clienteId) } : {}),
          });
        },
        // A timeline inteira fica na tela: o chat resume, e o resumo de uma
        // semana não cabe numa resposta de chat sem virar lista.
        destino: (a) => ({
          rotulo: 'Abrir Meus Atendimentos',
          rota: rotaComFiltros('/comercial/meus-atendimentos', {
            dias: numero(a.dias, 1),
            clienteId: texto(a.clienteId),
            escopo: texto(a.escopo) === 'equipe' ? 'equipe' : undefined,
          }),
        }),
      },
      {
        nome: 'minha_agenda',
        descricao:
          'Compromissos e tarefas do CRM: o que está pendente, o que venceu e o ' +
          'que está marcado para um período. Aceita filtro por cliente. Use para ' +
          '"o que eu tenho para hoje", "o que está atrasado" e "quando eu falo com ' +
          'o cliente X".',
        permissao: 'atividades.visualizar',
        limiteItens: 25,
        exemplos: [
          'O que eu tenho para hoje?',
          'Tenho algum retorno atrasado?',
          'Quando eu marquei de falar com o cliente X?',
        ],
        parametros: {
          type: 'object',
          properties: {
            clienteId: { type: 'string' },
            vencidas: {
              type: 'boolean',
              description: 'Só o que passou do prazo e não foi concluído',
            },
            pendentes: {
              type: 'boolean',
              description: 'Só o que ainda não foi concluído (padrão: true)',
            },
            dataInicio: {
              type: 'string',
              description: 'Início do período, AAAA-MM-DD',
            },
            dataFim: {
              type: 'string',
              description: 'Fim do período, AAAA-MM-DD',
            },
          },
        },
        executar: async (a, user) =>
          this.atividades.findAll(user.empresaAtivaId, user, {
            // Recorte por perfil — ver `filtroCarteira`.
            ...(await this.filtroCarteira(user)),
            page: 1,
            pageSize: 25,
            sortBy: 'dataVencimento',
            sortOrder: 'asc',
            ...(texto(a.clienteId) ? { clienteId: texto(a.clienteId) } : {}),
            ...(a.vencidas === true ? { vencidas: true } : {}),
            // O padrão é o que interessa a quem pergunta: o que falta fazer.
            ...(a.pendentes === false ? {} : { concluida: false }),
            ...(texto(a.dataInicio)
              ? { dataInicio: new Date(texto(a.dataInicio)) }
              : {}),
            ...(texto(a.dataFim)
              ? { dataFim: new Date(texto(a.dataFim)) }
              : {}),
          } as never),
        destino: (a) => ({
          rotulo: 'Abrir a agenda',
          rota: rotaComFiltros('/crm/agenda', {
            clienteId: texto(a.clienteId),
          }),
        }),
      },
      {
        nome: 'listar_oportunidades',
        descricao:
          'Oportunidades do CRM (funil de vendas): título, estágio, valor previsto ' +
          'e data de previsão. Aceita filtro por cliente e por estágio ' +
          '(prospeccao, qualificacao, proposta, negociacao, ganha, perdida).',
        permissao: 'oportunidades.visualizar',
        limiteItens: 25,
        exemplos: [
          'Quais oportunidades eu tenho em negociação?',
          'O que está no funil do cliente X?',
        ],
        parametros: {
          type: 'object',
          properties: {
            clienteId: { type: 'string' },
            estagio: {
              type: 'string',
              description:
                'prospeccao, qualificacao, proposta, negociacao, ganha ou perdida',
            },
          },
        },
        executar: async (a, user) =>
          this.oportunidades.findAll(user.empresaAtivaId, user, {
            ...(await this.filtroCarteira(user)),
            page: 1,
            pageSize: 25,
            sortOrder: 'desc',
            ...(texto(a.clienteId) ? { clienteId: texto(a.clienteId) } : {}),
            ...(texto(a.estagio) ? { estagio: texto(a.estagio) } : {}),
          } as never),
        destino: (a) => ({
          rotulo: 'Abrir o funil',
          rota: rotaComFiltros('/crm/oportunidades', {
            clienteId: texto(a.clienteId),
            estagio: texto(a.estagio),
          }),
        }),
      },
      {
        nome: 'historico_atendimento_cliente',
        descricao:
          'O que já aconteceu com um cliente: compromissos do CRM (feitos e a ' +
          'fazer), oportunidades no funil e o atendimento por WhatsApp (quantas ' +
          'conversas, quando foi o último contato e o começo da última mensagem). ' +
          'Use antes de ligar para o cliente, para saber onde a conversa parou. ' +
          'Não tem recorte de período: para "o que eu fiz nos últimos dias", com ' +
          'ou sem cliente, use resumo_atendimentos.',
        permissao: 'clientes.visualizar',
        limiteItens: 15,
        exemplos: [
          'O que já foi conversado com o cliente X?',
          'Quando foi o último contato com o cliente X?',
        ],
        parametros: {
          type: 'object',
          properties: { clienteId: { type: 'string' } },
          required: ['clienteId'],
        },
        executar: async (a, user) => {
          await this.garantirClienteNoAlcance(user, texto(a.clienteId));
          return this.historicoAtendimento(user, texto(a.clienteId));
        },
        destino: (a) => [
          {
            rotulo: 'Abrir a agenda do cliente',
            rota: rotaComFiltros('/crm/agenda', {
              clienteId: texto(a.clienteId),
            }),
          },
          {
            rotulo: 'Abrir a posição do cliente',
            rota: `/comercial/posicao-cliente/${texto(a.clienteId)}`,
          },
        ],
      },
      // ---- escrita: não executa direto, vira pendência de confirmação ----
      {
        nome: 'agendar_atividade',
        descricao:
          'Marca um compromisso na agenda do CRM: retorno de contato, ligação, ' +
          'visita, reunião ou tarefa. NÃO grava imediatamente — o usuário confirma ' +
          'na tela. Informe o título, quando (data e hora) e, quando for sobre um ' +
          'cliente, o clienteId. Vai para a agenda de quem está pedindo.',
        permissao: 'atividades.cadastrar',
        escrita: true,
        exemplos: [
          'Me lembre de retornar para o cliente X na sexta de manhã',
          'Agende uma visita ao cliente Y na terça às 14h',
        ],
        resumir: (a) => {
          const quando = texto(a.quando);
          return `${texto(a.titulo) || 'Compromisso'}${quando ? ` em ${quando.replace('T', ' ').slice(0, 16)}` : ''}`;
        },
        parametros: {
          type: 'object',
          properties: {
            titulo: {
              type: 'string',
              description:
                'O que fazer, ex.: "Retornar contato sobre o orçamento"',
            },
            quando: {
              type: 'string',
              description:
                'Data e hora no formato AAAA-MM-DDTHH:mm. Sem hora, use 09:00.',
            },
            tipo: {
              type: 'string',
              description: 'ligacao, reuniao, email, visita ou tarefa (padrão)',
            },
            clienteId: { type: 'string' },
            descricao: { type: 'string' },
          },
          required: ['titulo', 'quando'],
        },
        executar: async (a, user) => {
          // O compromisso é de quem pede, mas o cliente citado tem de ser dele:
          // sem isto o agente agenda na carteira do colega.
          if (texto(a.clienteId)) {
            await this.garantirClienteNoAlcance(user, texto(a.clienteId));
          }
          const vendedor = await this.atividades.vendedorDoUsuario(
            user.empresaAtivaId,
            user,
          );
          return this.atividades.create(user.empresaAtivaId, user, {
            vendedorId: vendedor.id,
            titulo: texto(a.titulo),
            tipo: TIPOS_ATIVIDADE.has(texto(a.tipo))
              ? (texto(a.tipo) as 'tarefa')
              : 'tarefa',
            dataVencimento: texto(a.quando) ? new Date(texto(a.quando)) : null,
            ...(texto(a.clienteId) ? { clienteId: texto(a.clienteId) } : {}),
            ...(texto(a.descricao) ? { descricao: texto(a.descricao) } : {}),
            concluida: false,
            ativo: true,
          });
        },
        destino: () => ({ rotulo: 'Abrir a agenda', rota: '/crm/agenda' }),
      },
      {
        nome: 'registrar_oportunidade',
        descricao:
          'Cria uma oportunidade no funil do CRM para um cliente. NÃO grava ' +
          'imediatamente — o usuário confirma na tela. Informe clienteId, título e, ' +
          'se souber, valor previsto e estágio.',
        permissao: 'oportunidades.cadastrar',
        escrita: true,
        exemplos: [
          'Registre uma oportunidade de R$ 5.000 para o cliente X',
          'Abra uma oportunidade de reposição mensal para o cliente Y',
        ],
        resumir: (a) =>
          `Oportunidade "${texto(a.titulo) || 'sem título'}"${
            typeof a.valorPrevisto === 'number'
              ? ` — R$ ${a.valorPrevisto.toFixed(2)}`
              : ''
          }`,
        parametros: {
          type: 'object',
          properties: {
            clienteId: { type: 'string' },
            titulo: { type: 'string' },
            valorPrevisto: { type: 'number' },
            estagio: {
              type: 'string',
              description:
                'prospeccao (padrão), qualificacao, proposta, negociacao, ganha ou perdida',
            },
            dataPrevisao: {
              type: 'string',
              description: 'Previsão de fechamento, AAAA-MM-DD',
            },
            observacao: { type: 'string' },
          },
          required: ['clienteId', 'titulo'],
        },
        executar: async (a, user) => {
          await this.garantirClienteNoAlcance(user, texto(a.clienteId));
          const vendedor = await this.atividades.vendedorDoUsuario(
            user.empresaAtivaId,
            user,
          );
          return this.oportunidades.create(user.empresaAtivaId, user, {
            clienteId: texto(a.clienteId),
            vendedorId: vendedor.id,
            titulo: texto(a.titulo),
            estagio: ESTAGIOS.has(texto(a.estagio))
              ? (texto(a.estagio) as 'prospeccao')
              : 'prospeccao',
            ...(typeof a.valorPrevisto === 'number'
              ? { valorPrevisto: a.valorPrevisto }
              : {}),
            ...(texto(a.dataPrevisao)
              ? { dataPrevisao: new Date(texto(a.dataPrevisao)) }
              : {}),
            ...(texto(a.observacao) ? { observacao: texto(a.observacao) } : {}),
            ativo: true,
          });
        },
        destino: (_a, r) => {
          const id = (r as { id?: unknown })?.id;
          return typeof id === 'string'
            ? {
                rotulo: 'Abrir a oportunidade',
                rota: `/crm/oportunidades/${id}`,
              }
            : { rotulo: 'Abrir o funil', rota: '/crm/oportunidades' };
        },
      },
      {
        nome: 'mover_oportunidade',
        descricao:
          'Atualiza uma oportunidade que já existe: muda o estágio no funil, o ' +
          'valor previsto, a previsão de fechamento ou a observação. Para marcar ' +
          'como perdida, informe também o motivo. NÃO grava imediatamente — o ' +
          'usuário confirma na tela. Use listar_oportunidades antes, para pegar o id.',
        permissao: 'oportunidades.editar',
        escrita: true,
        exemplos: [
          'Passe a oportunidade do cliente X para negociação',
          'Marque como ganha a oportunidade de reposição do cliente Y',
        ],
        resumir: (a) =>
          `Oportunidade → ${texto(a.estagio) || 'atualizar'}${
            texto(a.motivoPerda) ? ` (${texto(a.motivoPerda)})` : ''
          }`,
        parametros: {
          type: 'object',
          properties: {
            oportunidadeId: { type: 'string' },
            estagio: {
              type: 'string',
              description:
                'prospeccao, qualificacao, proposta, negociacao, ganha ou perdida',
            },
            valorPrevisto: { type: 'number' },
            dataPrevisao: { type: 'string', description: 'AAAA-MM-DD' },
            motivoPerda: {
              type: 'string',
              description: 'Obrigatório ao marcar como perdida',
            },
            observacao: { type: 'string' },
          },
          required: ['oportunidadeId'],
        },
        executar: async (a, user) => {
          await this.garantirOportunidadeNoAlcance(
            user,
            texto(a.oportunidadeId),
          );
          return this.oportunidades.update(
            user.empresaAtivaId,
            user,
            texto(a.oportunidadeId),
            {
              ...(ESTAGIOS.has(texto(a.estagio))
                ? { estagio: texto(a.estagio) as 'prospeccao' }
                : {}),
              ...(typeof a.valorPrevisto === 'number'
                ? { valorPrevisto: a.valorPrevisto }
                : {}),
              ...(texto(a.dataPrevisao)
                ? { dataPrevisao: new Date(texto(a.dataPrevisao)) }
                : {}),
              ...(texto(a.motivoPerda)
                ? { motivoPerda: texto(a.motivoPerda) }
                : {}),
              ...(texto(a.observacao)
                ? { observacao: texto(a.observacao) }
                : {}),
            },
          );
        },
        destino: (a) => ({
          rotulo: 'Abrir a oportunidade',
          rota: `/crm/oportunidades/${texto(a.oportunidadeId)}`,
        }),
      },
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
        executar: async (a, user) => {
          await this.garantirClienteNoAlcance(user, texto(a.clienteId));
          return this.orcamentos.create(user.empresaAtivaId, user, a as never);
        },
        destino: (_a, r) => {
          const id = (r as { id?: unknown })?.id;
          return typeof id === 'string'
            ? { rotulo: 'Abrir o orçamento', rota: `/crm/orcamentos/${id}` }
            : { rotulo: 'Abrir Orçamentos', rota: '/crm/orcamentos' };
        },
      },
      // ----------------------------------------------------------------------
      // WhatsApp do próprio vendedor.
      //
      // Todas marcadas `exigeWhatsapp`: sem aparelho pareado não há de onde ler
      // nem por onde falar. E todas enxergam **só a própria conexão**, mesmo
      // para quem tem `whatsapp-equipe` — gerente e supervisor monitoram o time
      // na tela de Atendimento, onde o texto fica; pelo agente ele viajaria
      // para o provedor de IA. Decisão do usuário em 2026-08-25.
      // ----------------------------------------------------------------------
      {
        nome: 'conversas_whatsapp',
        descricao:
          'Os atendimentos por WhatsApp deste vendedor: com quem falou, quando foi ' +
          'o último contato, quem falou por último e quantas mensagens não lidas ' +
          'ficaram. Use `busca` para um contato específico (nome ou telefone) e ' +
          'sem `busca` para os últimos atendimentos. Devolve o `conversaId` que as ' +
          'outras ferramentas de WhatsApp pedem.',
        permissao: 'whatsapp-conversas.visualizar',
        exigeWhatsapp: true,
        limiteItens: 15,
        exemplos: [
          'Quando foi a última vez que falei com o 11 98765-4321?',
          'Quais foram meus últimos atendimentos no WhatsApp?',
          'Tem alguma conversa esperando resposta minha?',
        ],
        parametros: {
          type: 'object',
          properties: {
            busca: {
              type: 'string',
              description:
                'Nome ou telefone do contato. Pode ser parcial; sem isto vêm os mais recentes.',
            },
          },
        },
        executar: async (a, user) => {
          const vendedor = await this.vendedores.vendedorDoUsuario(
            user.empresaAtivaId,
            user,
          );
          // Sem cadastro de vendedor não existe conexão, e a ferramenta nem
          // deveria estar visível — mas `exigeWhatsapp` filtra o catálogo, e um
          // `tool_call` é texto gerado por um modelo, não autorização.
          if (!vendedor) {
            throw new ForbiddenException(
              'Seu usuário não tem WhatsApp vinculado.',
            );
          }
          return this.conversas.listar(user.empresaAtivaId, user, {
            // O corte que prende a busca à própria conexão: `filtroSessao`
            // intersecta este vendedorId com o escopo de leitura, então pedir o
            // próprio nunca amplia — nem para quem alcança a equipe.
            vendedorId: vendedor.id,
            ...(texto(a.busca) ? { busca: texto(a.busca) } : {}),
            arquivadas: false,
            semVinculo: false,
            pagina: 1,
            tamanho: 15,
          });
        },
        destino: () => ({
          rotulo: 'Abrir as Conversas',
          rota: '/comercial/atendimento',
        }),
      },
      {
        nome: 'mensagens_whatsapp',
        descricao:
          'O que foi dito numa conversa de WhatsApp — as mensagens mais recentes, ' +
          'na ordem. Use para resumir um atendimento, conferir o que o cliente ' +
          'pediu e se já foi respondido. Pegue o `conversaId` em conversas_whatsapp.',
        permissao: 'whatsapp-conversas.visualizar',
        exigeWhatsapp: true,
        limiteItens: 30,
        exemplos: [
          'Faça um resumo do meu último atendimento com o cliente X',
          'Na última conversa com o cliente Y, atendi o que ele pediu?',
          'O que ficou pendente na conversa com o 11 98765-4321?',
        ],
        parametros: {
          type: 'object',
          properties: {
            conversaId: {
              type: 'string',
              description: 'Vem de conversas_whatsapp',
            },
          },
          required: ['conversaId'],
        },
        executar: (a, user) =>
          this.conversas.mensagensDaPropriaConexao(
            user.empresaAtivaId,
            user,
            texto(a.conversaId),
            { tamanho: 30 },
          ),
        destino: () => ({
          rotulo: 'Abrir as Conversas',
          rota: '/comercial/atendimento',
        }),
      },
      {
        nome: 'agendar_mensagem_whatsapp',
        descricao:
          'Deixa uma mensagem programada para sair no WhatsApp numa data e hora ' +
          'futuras. NÃO envia nem grava imediatamente — o usuário confirma na tela. ' +
          'Pegue o `conversaId` em conversas_whatsapp.',
        permissao: 'whatsapp-conversas.cadastrar',
        exigeWhatsapp: true,
        escrita: true,
        exemplos: [
          'Agende uma mensagem para o cliente X na segunda de manhã avisando da entrega',
          'Programe um lembrete de pagamento para o cliente Y amanhã às 9h',
        ],
        resumir: (a) => {
          const quando = texto(a.quando).replace('T', ' ').slice(0, 16);
          const msg = texto(a.texto);
          const trecho = msg.length > 80 ? `${msg.slice(0, 80)}…` : msg;
          return `Mensagem no WhatsApp${quando ? ` em ${quando}` : ''}: "${trecho}"`;
        },
        parametros: {
          type: 'object',
          properties: {
            conversaId: {
              type: 'string',
              description: 'Vem de conversas_whatsapp',
            },
            texto: {
              type: 'string',
              description: 'A mensagem, como o cliente vai lê-la',
            },
            quando: {
              type: 'string',
              description:
                'Data e hora no formato AAAA-MM-DDTHH:mm. Precisa ser no futuro.',
            },
          },
          required: ['conversaId', 'texto', 'quando'],
        },
        executar: (a, user) =>
          this.agendamento.agendar(
            user.empresaAtivaId,
            user,
            texto(a.conversaId),
            {
              texto: texto(a.texto),
              enviarEm: new Date(texto(a.quando)),
            },
          ),
        destino: () => ({
          rotulo: 'Abrir as Conversas',
          rota: '/comercial/atendimento',
        }),
      },
      {
        nome: 'enviar_documento_whatsapp',
        descricao:
          'Manda para o cliente, pela conversa de WhatsApp, um documento que a ' +
          'plataforma já tem: `titulos` (o que está em aberto), `notas` (as últimas ' +
          'notas fiscais), `boleto` (2ª via de um título), `danfe` (PDF de uma nota) ' +
          'ou `orcamento` (a proposta em PDF). NÃO envia imediatamente — o usuário ' +
          'confirma na tela. `boleto`, `danfe` e `orcamento` exigem o id do registro: ' +
          'pegue em titulos_em_aberto, listar_orcamentos ou vendas_por_cliente. Só ' +
          'funciona em conversa de contato já vinculado a um cliente.',
        permissao: 'whatsapp-conversas.cadastrar',
        exigeWhatsapp: true,
        escrita: true,
        exemplos: [
          'Reenvie os títulos em aberto para o cliente X no WhatsApp',
          'Manda a 2ª via do boleto vencido para o cliente Y',
          'Envie o orçamento que acabei de fazer pelo WhatsApp',
        ],
        resumir: (a) => {
          const rotulos: Record<string, string> = {
            titulos: 'Títulos em aberto',
            notas: 'Últimas notas fiscais',
            boleto: '2ª via de boleto',
            danfe: 'DANFE em PDF',
            orcamento: 'Orçamento em PDF',
          };
          return `${rotulos[texto(a.tipo)] ?? 'Documento'} pelo WhatsApp`;
        },
        parametros: {
          type: 'object',
          properties: {
            conversaId: {
              type: 'string',
              description: 'Vem de conversas_whatsapp',
            },
            tipo: {
              type: 'string',
              description: 'titulos, notas, boleto, danfe ou orcamento',
            },
            documentoId: {
              type: 'string',
              description:
                'O título (boleto), a nota (danfe) ou o orçamento a enviar. ' +
                'Obrigatório nesses três tipos; ignorado em titulos e notas.',
            },
            legenda: {
              type: 'string',
              description: 'Texto que acompanha o anexo (opcional)',
            },
          },
          required: ['conversaId', 'tipo'],
        },
        executar: (a, user) => {
          const empresaId = user.empresaAtivaId;
          const conversaId = texto(a.conversaId);
          const documentoId = texto(a.documentoId);
          const legenda = texto(a.legenda);
          // O id é cobrado aqui, e não só na validação do service, para o
          // modelo receber de volta uma frase que o ensina a se corrigir no
          // mesmo turno — em vez de um erro de campo obrigatório.
          const exigirId = (rotulo: string) => {
            if (!documentoId) {
              throw new ForbiddenException(
                `Para enviar ${rotulo} é preciso o id do registro. Consulte antes a ferramenta de listagem correspondente.`,
              );
            }
            return documentoId;
          };

          switch (texto(a.tipo)) {
            case 'titulos':
              return this.whatsappAcoes.enviarTitulos(
                empresaId,
                user,
                conversaId,
              );
            case 'notas':
              return this.whatsappAcoes.enviarNotas(
                empresaId,
                user,
                conversaId,
              );
            case 'boleto':
              return this.whatsappAcoes.enviarBoleto(
                empresaId,
                user,
                conversaId,
                {
                  tituloReceberId: exigirId('boleto'),
                  ...(legenda ? { legenda } : {}),
                },
              );
            case 'danfe':
              return this.whatsappAcoes.enviarDanfe(
                empresaId,
                user,
                conversaId,
                {
                  notaSaidaId: exigirId('DANFE'),
                  incluirXml: false,
                  ...(legenda ? { legenda } : {}),
                },
              );
            case 'orcamento':
              return this.whatsappAcoes.enviarOrcamento(
                empresaId,
                user,
                conversaId,
                {
                  orcamentoId: exigirId('orçamento'),
                  ...(legenda ? { legenda } : {}),
                },
              );
            default:
              throw new ForbiddenException(
                `Tipo de documento desconhecido: ${texto(a.tipo)}. Use titulos, notas, boleto, danfe ou orcamento.`,
              );
          }
        },
        destino: () => ({
          rotulo: 'Abrir as Conversas',
          rota: '/comercial/atendimento',
        }),
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
        this.permitida(f, user) &&
        this.liberadaPelaConfig(f, filtro, user) &&
        // Sem filtro, `exigeWhatsapp` fecha. É o mesmo default do módulo de
        // WhatsApp: conversa de cliente é dado pessoal, e quem não provou ter
        // aparelho vinculado não enxerga.
        (!f.exigeWhatsapp || !!filtro?.whatsappVinculado),
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
