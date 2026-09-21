import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AtividadesService } from '../atividades/atividades.service';
import { ObjetivosService } from '../objetivos/objetivos.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { VendedoresService } from '../vendedores/vendedores.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * O que a pessoa precisa saber ao abrir o assistente.
 *
 * Existe porque a saudação personalizada **não sobrevive em prompt**. Pedir ao
 * modelo "ao receber um bom dia, cumprimente pelo nome, confira a meta, resuma
 * a agenda, veja o aniversário e os recados" obriga-o a encadear quatro
 * chamadas certas, na ordem, toda vez — ele acerta em alguns dias e falha em
 * outros, que é a pior forma de falhar. Aqui o servidor compõe as quatro
 * coisas de uma vez, e ao prompt sobra o que ele faz bem: o tom.
 *
 * Vale a regra do projeto: **acesso é código, comportamento é prompt.** Cada
 * bloco abaixo respeita a permissão da sua origem, e quem não a tem
 * simplesmente não recebe o bloco — não é o texto do prompt que esconde.
 *
 * Nada aqui toca o Prisma para ler dado de negócio: delega aos mesmos services
 * das telas, com o mesmo usuário autenticado, pelo mesmo motivo do resto do
 * catálogo (`agente-tools.service.ts`). A única leitura direta é a do vínculo
 * do próprio usuário, que não é dado de negócio e não tem service de tela.
 */

/** Quantos itens da agenda o modelo vê. O resto vira contagem. */
const ITENS_AGENDA = 5;

/** A partir daqui é "reta final"; de 100 em diante, meta batida. */
const PERTO_DA_META = 80;

export interface MeuDiaAgendaItem {
  titulo: string;
  tipo: string;
  /** "hoje", "hoje às 14:00" ou "atrasada há 3 dia(s)". */
  quando: string;
}

export interface MeuDiaMeta {
  mes: number;
  ano: number;
  objetivo: number;
  realizado: number;
  percentual: number;
  /**
   * O corte é **daqui**, não do modelo.
   *
   * Deixar "está perto da meta?" para o prompt significa um limiar diferente a
   * cada resposta: o modelo parabeniza com 62% numa conversa e cobra com 91%
   * na seguinte, sem que ninguém consiga apontar onde está escrito.
   */
  situacao: 'abaixo' | 'perto' | 'atingida';
}

export interface MeuDia {
  /** Como chamar a pessoa: o nome reduzido do cadastro, ou o primeiro nome. */
  tratamento: string;
  /** Hoje é o aniversário dela. */
  aniversario: boolean;
  /** Nulo quando não tem `atividades.visualizar`. */
  agenda: {
    hoje: number;
    atrasadas: number;
    proximas: MeuDiaAgendaItem[];
  } | null;
  /** Nulo quando não é vendedor ou não tem `dashboard-comercial.visualizar`. */
  meta: MeuDiaMeta | null;
  /**
   * Quantos recados não lidos há no sino. **Só a contagem.**
   *
   * O título de uma notificação é texto livre e costuma trazer o nome de quem
   * originou ("nova mensagem de …"). Mandá-lo ao provedor furaria a máscara de
   * identificação por um caminho que ela não cobre — ela age sobre campos
   * conhecidos, não sobre prosa. E não faz falta: o que se quer aqui é o
   * assistente **oferecer** mostrar, não despejar a caixa de entrada.
   */
  recados: number;
}

@Injectable()
export class AgenteMeuDiaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly atividades: AtividadesService,
    private readonly objetivos: ObjetivosService,
    private readonly notificacoes: NotificacoesService,
    private readonly vendedores: VendedoresService,
  ) {}

  private pode(user: AuthenticatedUser, permissao: string): boolean {
    return user.isAdmin || user.permissoes.includes(permissao);
  }

  async montar(empresaId: string, user: AuthenticatedUser): Promise<MeuDia> {
    const vinculo = await this.prisma.withTenant(empresaId, (tx) =>
      tx.usuarioEmpresa.findFirst({
        where: { usuarioId: user.id, empresaId, deletedAt: null },
        select: { nomeReduzido: true, dataNascimento: true },
      }),
    );

    // As três fontes são independentes: uma fora do ar não pode derrubar as
    // outras duas nem a saudação. Ver `semQuebrar`.
    const [agenda, meta, recados] = await Promise.all([
      this.semQuebrar(() => this.agendaDe(empresaId, user), null),
      this.semQuebrar(() => this.metaDe(empresaId, user), null),
      this.semQuebrar(() => this.recadosDe(empresaId, user), 0),
    ]);

    return {
      tratamento:
        vinculo?.nomeReduzido?.trim() || user.nome.trim().split(/\s+/)[0],
      aniversario: this.ehHoje(vinculo?.dataNascimento ?? null),
      agenda,
      meta,
      recados,
    };
  }

  /**
   * Este bloco é enfeite de uma saudação, não a resposta a uma pergunta.
   *
   * Se o Dashboard Comercial falhar, a alternativa a um "bom dia" sem a linha
   * da meta seria um "bom dia" que não acontece — e a conversa inteira morre
   * junto, porque isto é montado na primeira mensagem. Falhou, fica de fora.
   */
  private async semQuebrar<T>(fn: () => Promise<T>, padrao: T): Promise<T> {
    try {
      return await fn();
    } catch {
      return padrao;
    }
  }

  /** Aniversário compara dia e mês — o ano é o de nascimento. */
  private ehHoje(data: Date | null): boolean {
    if (!data) return false;
    const hoje = new Date();
    return (
      data.getUTCDate() === hoje.getUTCDate() &&
      data.getUTCMonth() === hoje.getUTCMonth()
    );
  }

  private async agendaDe(empresaId: string, user: AuthenticatedUser) {
    if (!this.pode(user, 'atividades.visualizar')) return null;

    const inicioDeHoje = new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate(),
      ),
    );
    const fimDeHoje = new Date(inicioDeHoje.getTime() + 86_400_000 - 1);

    // Pendente com vencimento até o fim de hoje: pega o atrasado e o do dia
    // numa consulta só. O que vence amanhã não é assunto de "bom dia".
    const pagina = (await this.atividades.findAll(empresaId, user, {
      ...(await this.escopoDoVendedor(empresaId, user)),
      page: 1,
      pageSize: 50,
      sortBy: 'dataVencimento',
      sortOrder: 'asc',
      concluida: false,
      dataFim: fimDeHoje,
    } as never)) as {
      data: { titulo: string; tipo: string; dataVencimento: Date | null }[];
    };

    const itens = pagina.data ?? [];
    const atrasadas = itens.filter(
      (a) => a.dataVencimento && a.dataVencimento < inicioDeHoje,
    );
    const hoje = itens.filter(
      (a) => !a.dataVencimento || a.dataVencimento >= inicioDeHoje,
    );

    return {
      hoje: hoje.length,
      atrasadas: atrasadas.length,
      // O atrasado vem primeiro de propósito: é o que muda o que a pessoa faz
      // nos próximos minutos, e é o primeiro a ser cortado se a lista encher.
      proximas: [...atrasadas, ...hoje].slice(0, ITENS_AGENDA).map((a) => ({
        titulo: a.titulo,
        tipo: a.tipo,
        quando: this.quando(a.dataVencimento, inicioDeHoje),
      })),
    };
  }

  private quando(data: Date | null, inicioDeHoje: Date): string {
    if (!data) return 'sem data';
    if (data < inicioDeHoje) {
      const dias = Math.ceil(
        (inicioDeHoje.getTime() - data.getTime()) / 86_400_000,
      );
      return `atrasada há ${dias} dia(s)`;
    }
    const hora = data.toISOString().slice(11, 16);
    return hora === '00:00' ? 'hoje' : `hoje às ${hora}`;
  }

  /**
   * A meta é de quem vende, e só.
   *
   * Não se usa aqui o mesmo recorte das ferramentas (`filtroCarteira`), porque
   * a pergunta é outra: lá é "o que esta pessoa alcança" — e para um
   * administrador a resposta é "tudo", o que faria a saudação apresentar o
   * realizado da empresa inteira como se fosse a meta dele. Aqui a pergunta é
   * "de quem é a meta", e ela só tem resposta para um vendedor.
   */
  private async metaDe(empresaId: string, user: AuthenticatedUser) {
    if (!this.pode(user, 'dashboard-comercial.visualizar')) return null;

    const vendedor = await this.vendedores.vendedorDoUsuario(empresaId, user);
    if (!vendedor || vendedor.tipo !== 'vendedor') return null;

    const agora = new Date();
    const mes = agora.getMonth() + 1;
    const ano = agora.getFullYear();

    const d = (await this.objetivos.dashboard(empresaId, user, {
      mes,
      ano,
      vendedorId: vendedor.id,
    })) as {
      objetivoValor: number;
      realizadoValor: number;
      percRealizado: number;
    };

    // Sem objetivo digitado não há meta: o percentual viria zerado e o
    // assistente diria "você está em 0%" a quem simplesmente não tem número
    // lançado no mês.
    if (!d.objetivoValor) return null;

    return {
      mes,
      ano,
      objetivo: d.objetivoValor,
      realizado: d.realizadoValor,
      percentual: d.percRealizado,
      situacao:
        d.percRealizado >= 100
          ? ('atingida' as const)
          : d.percRealizado >= PERTO_DA_META
            ? ('perto' as const)
            : ('abaixo' as const),
    };
  }

  private async recadosDe(empresaId: string, user: AuthenticatedUser) {
    const feed = await this.notificacoes.feed(empresaId, user);
    return feed.total;
  }

  /** O vendedor que a pessoa é, quando ela é um — igual ao resto do agente. */
  private async escopoDoVendedor(
    empresaId: string,
    user: AuthenticatedUser,
  ): Promise<{ vendedorId?: string }> {
    if (user.isAdmin) return {};
    const vendedor = await this.vendedores.vendedorDoUsuario(empresaId, user);
    if (!vendedor || vendedor.tipo !== 'vendedor') return {};
    return { vendedorId: vendedor.id };
  }
}
