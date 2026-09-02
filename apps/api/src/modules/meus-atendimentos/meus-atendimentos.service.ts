import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { TenantTx } from '../../common/prisma/prisma.service';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import type {
  CategoriaAtendimento,
  MeusAtendimentos,
  MeusAtendimentosQuery,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * O que **este** vendedor fez, em linha do tempo.
 *
 * Lê da rotina de Atividades e de mais lugar nenhum. Cada passo do atendimento
 * já é gravado lá como atividade concluída, pelos helpers do servidor:
 * conversa de WhatsApp (`registrarAtendimentoWhatsapp`, um registro por
 * cliente por dia), 2ª via e envio de documento (`registrarAtividadeDocumento`),
 * orçamento (`registrarAtividadeOrcamento`) e o que o próprio vendedor marcou
 * na agenda. Montar este resumo consultando cada módulo de novo daria uma
 * segunda definição de "atendimento", que divergiria da primeira.
 *
 * **Quem aparece:** o usuário logado — a carteira dele e o que ele executou
 * na carteira de outro, que é como supervisor e gerente trabalham. Eles podem
 * pedir `escopo: 'equipe'` para acompanhar a linha do tempo dos subordinados;
 * o recorte é o mesmo `resolverEscopoVendedores` das telas, então ninguém
 * alcança por aqui quem não alcança lá. Quem não tem cadastro de vendedor nem
 * equipe recebe a timeline vazia, em vez da de alguém.
 */
@Injectable()
export class MeusAtendimentosService {
  constructor(private readonly prisma: PrismaService) {}

  async resumo(
    empresaId: string,
    user: AuthenticatedUser,
    query: MeusAtendimentosQuery,
  ): Promise<MeusAtendimentos> {
    // A janela conta dias inteiros e inclui hoje: `dias: 1` é "hoje", que é o
    // que alguém quer dizer ao perguntar "o que eu fiz hoje". Sem `dias`, o
    // feed não tem começo — rola até o primeiro atendimento que existir.
    const ate = new Date();
    let de: Date | null = null;
    if (query.dias) {
      de = new Date();
      de.setDate(de.getDate() - (query.dias - 1));
      de.setHours(0, 0, 0, 0);
    }

    const { proprio, equipe } = await this.prisma.withTenant(empresaId, (tx) =>
      this.carteiras(tx, empresaId, user),
    );
    // Sem cadastro de vendedor e sem equipe não há atendimento a mostrar: quem
    // está aqui é administrativo ou financeiro, e a timeline é do quem atende.
    if (!proprio && equipe.length === 0) {
      return this.vazio(query, de, ate, false);
    }

    const podeVerEquipe = equipe.length > 0;
    const verEquipe = query.escopo === 'equipe' && podeVerEquipe;

    // **Toda condição composta entra em `AND`, e nenhuma delas usa `OR` na
    // raiz do `where`.** Não é preciosismo: a versão anterior punha o recorte
    // de escopo num `OR` de raiz e, na hora de paginar, espalhava o `OR` do
    // cursor por cima — o spread substituía a chave, e da segunda página em
    // diante o feed devolvia atividade de qualquer vendedor da empresa. Duas
    // cláusulas `OR` no mesmo objeto nunca convivem; dentro de `AND`, sim.
    const deQuem = verEquipe
      ? // **equipe**: a carteira dos subordinados, para acompanhar.
        { vendedorId: { in: equipe } }
      : // **própria**: o que está na carteira dele *ou* o que ele mesmo
        // executou (`createdBy`). Supervisor e gerente atendem na carteira do
        // subordinado, e o registro fica lá — é onde o histórico do cliente é
        // consultado. Sem a segunda metade, quem mais atende abria a tela
        // vazia.
        {
          OR: [
            ...(proprio ? [{ vendedorId: proprio }] : []),
            { createdBy: user.id },
          ],
        };

    // O que aconteceu no período **ou** o que foi marcado nele: um retorno
    // agendado hoje para a semana que vem é trabalho de hoje, e some da
    // timeline se o corte olhar só a conclusão.
    const noPeriodo = de
      ? [
          {
            OR: [
              { dataConclusao: { gte: de, lte: ate } },
              { createdAt: { gte: de, lte: ate } },
            ],
          },
        ]
      : [];

    const where = {
      empresaId,
      deletedAt: null,
      ...(query.clienteId ? { clienteId: query.clienteId } : {}),
      AND: [deQuem, ...noPeriodo],
    };

    // Uma página a mais do que o pedido: se voltar, é o sinal de que há
    // próxima — e evita um `count` a cada rolagem.
    const limite = query.limite;
    const cursor = decodificarCursor(query.cursor);

    // O feed é ordenado por `createdAt`, e o cursor sai daí: é a única coluna
    // que existe em toda linha (`dataConclusao` é nula no pendente) e a única
    // indexada. O desempate por id evita repetir ou pular registro quando dois
    // caem no mesmo instante — o que acontece o tempo todo aqui (a conversa e
    // o boleto que saiu dela).
    const apartirDoCursor = cursor
      ? [
          {
            OR: [
              { createdAt: { lt: cursor.data } },
              { createdAt: cursor.data, id: { lt: cursor.id } },
            ],
          },
        ]
      : [];

    const [pagina, totais] = await this.prisma.withTenant(empresaId, (tx) =>
      Promise.all([
        tx.atividade.findMany({
          where: {
            ...where,
            AND: [...where.AND, ...apartirDoCursor],
          },
          select: {
            id: true,
            titulo: true,
            descricao: true,
            concluida: true,
            dataConclusao: true,
            createdAt: true,
            clienteId: true,
            cliente: { select: { razaoSocial: true, nomeFantasia: true } },
            vendedor: { select: { nomeReduzido: true, nome: true } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limite + 1,
        }),
        // Os contadores do topo são do **período inteiro**, não da página: um
        // feed que soma só o que já rolou mostraria número crescendo sozinho.
        // Só duas colunas, e com teto — a categoria sai do título, em TS, para
        // não existir uma segunda definição dela em SQL.
        tx.atividade.findMany({
          where,
          select: { titulo: true, clienteId: true },
          take: TETO_TOTAIS,
        }),
      ]),
    );

    const temMais = pagina.length > limite;
    const registros = temMais ? pagina.slice(0, limite) : pagina;
    const ultimo = registros[registros.length - 1];

    const itens = registros.map((a) => ({
      id: a.id,
      quando: (a.dataConclusao ?? a.createdAt).toISOString(),
      titulo: a.titulo,
      descricao: a.descricao,
      categoria: categoriaDoTitulo(a.titulo),
      clienteId: a.clienteId,
      clienteNome: a.cliente?.nomeFantasia || a.cliente?.razaoSocial || null,
      vendedorNome: a.vendedor?.nomeReduzido || a.vendedor?.nome || null,
      concluida: a.concluida,
    }));

    const conta = (categoria: CategoriaAtendimento) =>
      totais.filter((t) => categoriaDoTitulo(t.titulo) === categoria).length;

    return {
      dias: query.dias ?? null,
      de: de?.toISOString() ?? null,
      ate: ate.toISOString(),
      proximoCursor:
        temMais && ultimo ? codificarCursor(ultimo.createdAt, ultimo.id) : null,
      escopo: verEquipe ? 'equipe' : 'proprio',
      podeVerEquipe,
      totais: {
        registros: totais.length,
        clientes: new Set(
          totais.map((t) => t.clienteId).filter((id): id is string => !!id),
        ).size,
        whatsapp: conta('whatsapp'),
        documento: conta('documento'),
        orcamento: conta('orcamento'),
        agenda: conta('agenda'),
      },
      itens,
    };
  }

  /**
   * A carteira do usuário e a dos subordinados dele.
   *
   * `proprio` é o id do cadastro de Vendedor ligado ao login — nulo para quem
   * não tem (administrativo, financeiro). `equipe` sai de
   * `resolverEscopoVendedores`, a mesma função que recorta as telas, **menos**
   * ele mesmo: o que interessa aqui é "os outros que eu acompanho". Vem vazia
   * para o vendedor puro (não supervisiona ninguém) e também para quem tem
   * alcance irrestrito sem equipe cadastrada — diretor e administrador não
   * têm subordinados a listar, têm a empresa, que é outra tela.
   */
  private async carteiras(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
  ): Promise<{ proprio: string | null; equipe: string[] }> {
    const vendedor = await tx.vendedor.findFirst({
      where: { usuarioId: user.id, empresaId, deletedAt: null },
      select: { id: true },
    });
    const escopo = await resolverEscopoVendedores(tx, empresaId, user);
    // Escopo nulo = alcance irrestrito (administrador, diretor). Para eles a
    // "equipe" é a empresa inteira: sem isto, quem enxerga tudo era o único a
    // não ter o seletor, e via só a própria carteira nesta tela.
    const todos =
      escopo ??
      (
        await tx.vendedor.findMany({
          where: { empresaId, deletedAt: null, ativo: true },
          select: { id: true },
        })
      ).map((v) => v.id);
    const equipe = todos.filter((id) => id !== vendedor?.id);
    return { proprio: vendedor?.id ?? null, equipe };
  }

  private vazio(
    query: MeusAtendimentosQuery,
    de: Date | null,
    ate: Date,
    podeVerEquipe: boolean,
  ): MeusAtendimentos {
    return {
      dias: query.dias ?? null,
      de: de?.toISOString() ?? null,
      ate: ate.toISOString(),
      proximoCursor: null,
      escopo: 'proprio',
      podeVerEquipe,
      totais: {
        registros: 0,
        clientes: 0,
        whatsapp: 0,
        documento: 0,
        orcamento: 0,
        agenda: 0,
      },
      itens: [],
    };
  }
}

/**
 * Teto do que os contadores do topo somam.
 *
 * Eles são do período inteiro (não da página), então precisam de um limite:
 * um feed sem recorte de data, numa base de anos, traria a carteira toda só
 * para contar. Cinco mil registros cobrem com folga um ano de um vendedor
 * ativo — acima disso o número vira "mais de", e quem quer o total exato tem
 * o Dashboard.
 */
const TETO_TOTAIS = 5_000;

/**
 * O cursor do feed: o instante do último item e o id dele, em base64.
 *
 * Vai e volta como texto opaco de propósito — a tela não deve montar cursor,
 * só devolver o que recebeu. Cursor ilegível é tratado como ausente: a pior
 * consequência é a primeira página de novo, e não um erro na cara de quem
 * está rolando a lista.
 */
function codificarCursor(data: Date, id: string): string {
  return Buffer.from(`${data.toISOString()}|${id}`).toString('base64url');
}

function decodificarCursor(
  cursor: string | undefined,
): { data: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString().split('|');
    const data = new Date(iso);
    if (!id || Number.isNaN(data.getTime())) return null;
    return { data, id };
  } catch {
    return null;
  }
}

/**
 * De qual frente do atendimento esta atividade veio.
 *
 * Pelo título, porque é o que existe: a Atividade não tem coluna de origem, e
 * criar uma agora exigiria reescrever o histórico já gravado. Não é
 * adivinhação de texto livre — os títulos vêm de três helpers do servidor, com
 * texto fixo (ver `registrar-atendimento-whatsapp.ts`,
 * `registrar-atividade-documento.ts` e `registrar-atividade-orcamento.ts`).
 * O que alguém digitou à mão cai em `agenda`, que é de onde veio.
 */
export function categoriaDoTitulo(titulo: string): CategoriaAtendimento {
  const t = titulo.toLowerCase();
  if (t.startsWith('atendimento por whatsapp')) return 'whatsapp';
  if (t.includes('orçamento') || t.includes('proposta')) return 'orcamento';
  if (
    t.includes('2ª via') ||
    t.includes('danfe') ||
    t.includes('boleto') ||
    t.includes('xml') ||
    t.includes('títulos em aberto') ||
    t.includes('notas fiscais')
  ) {
    return 'documento';
  }
  return 'agenda';
}
