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
import { AgenteConfigService } from './agente-config.service';
import { AgenteToolsService } from './agente-tools.service';
import { ProvedorFactory } from './provedor.factory';
import type { MensagemChat } from './provedor-ia';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/** Ação de escrita preparada e aguardando o Confirmar do usuário. */
export interface Pendencia {
  id: string;
  ferramenta: string;
  resumo: string;
  argumentos: Record<string, unknown>;
}

/**
 * O laço de conversa do agente.
 *
 * Ferramentas de **leitura** executam no laço, e o resultado volta ao modelo
 * para ele redigir a resposta. Ferramentas de **escrita** não executam: viram
 * uma pendência que o usuário confirma na tela. É a rede de segurança contra o
 * modelo interpretar mal um pedido e gravar um orçamento errado — em ERP, o
 * custo de desfazer é alto.
 */
@Injectable()
export class AgenteChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AgenteConfigService,
    private readonly tools: AgenteToolsService,
    private readonly provedores: ProvedorFactory,
  ) {}

  async listarConversas(empresaId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteConversa.findMany({
        where: { empresaId, usuarioId: user.id, arquivada: false },
        orderBy: { updatedAt: 'desc' },
        take: 30,
        select: { id: true, titulo: true, updatedAt: true },
      }),
    );
  }

  async detalhar(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const conversa = await this.minhaConversa(tx, empresaId, user, id);
      const mensagens = await tx.agenteMensagem.findMany({
        where: { empresaId, conversaId: conversa.id },
        orderBy: { criadaEm: 'asc' },
      });
      return {
        id: conversa.id,
        titulo: conversa.titulo,
        mensagens: mensagens.map((m) => ({
          id: m.id,
          papel: m.papel,
          conteudo: m.conteudo,
          ferramenta: m.ferramenta,
          pendente: m.pendente,
          confirmadaEm: m.confirmadaEm,
          criadaEm: m.criadaEm,
        })),
      };
    });
  }

  /** Uma conversa é do usuário que a criou — nem o admin lê a dos outros. */
  private async minhaConversa(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
  ) {
    const conversa = await tx.agenteConversa.findFirst({
      where: { id, empresaId, usuarioId: user.id },
    });
    if (!conversa) throw new NotFoundException('Conversa não encontrada');
    return conversa;
  }

  async enviar(
    empresaId: string,
    user: AuthenticatedUser,
    params: { conversaId?: string; texto: string },
  ) {
    const cfg = await this.config.paraUso(empresaId);

    const conversaId = await this.prisma.withTenant(empresaId, async (tx) => {
      if (params.conversaId) {
        const c = await this.minhaConversa(
          tx,
          empresaId,
          user,
          params.conversaId,
        );
        return c.id;
      }
      const nova = await tx.agenteConversa.create({
        data: {
          empresaId,
          usuarioId: user.id,
          // Título provisório a partir da primeira pergunta — melhor que
          // "Nova conversa" numa lista de 30.
          titulo: params.texto.slice(0, 60),
        },
      });
      return nova.id;
    });

    await this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteMensagem.create({
        data: {
          empresaId,
          conversaId,
          papel: 'usuario',
          conteudo: params.texto,
        },
      }),
    );

    const mensagens = await this.montarContexto(
      empresaId,
      user,
      conversaId,
      cfg.historicoMensagens,
      cfg.systemPrompt,
    );

    const ferramentas = this.tools.paraProvedor(user);
    const pendencias: Pendencia[] = [];
    let textoFinal: string | null = null;

    for (let volta = 0; volta < cfg.maxIteracoesFerramentas; volta++) {
      const resposta = await this.provedores.para(cfg.provedor).conversar({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        modelo: cfg.modelo,
        temperatura: cfg.temperatura,
        maxTokens: cfg.maxTokens,
        mensagens,
        ferramentas,
      });

      if (resposta.chamadas.length === 0) {
        textoFinal = resposta.texto;
        await this.prisma.withTenant(empresaId, (tx) =>
          tx.agenteMensagem.create({
            data: {
              empresaId,
              conversaId,
              papel: 'assistente',
              conteudo: textoFinal,
              tokensEntrada: resposta.tokensEntrada,
              tokensSaida: resposta.tokensSaida,
            },
          }),
        );
        break;
      }

      mensagens.push({
        papel: 'assistant',
        conteudo: resposta.texto,
        chamadas: resposta.chamadas,
      });

      for (const chamada of resposta.chamadas) {
        const ferramenta = this.tools.buscar(chamada.nome);

        if (!ferramenta) {
          mensagens.push({
            papel: 'tool',
            chamadaId: chamada.id,
            conteudo: `Erro: ferramenta "${chamada.nome}" não existe.`,
          });
          continue;
        }

        // Trava de execução: a filtragem do catálogo já deveria impedir, mas
        // o tool_call é texto gerado por um modelo e não vale como permissão.
        try {
          this.tools.garantirPermissao(ferramenta, user);
        } catch {
          mensagens.push({
            papel: 'tool',
            chamadaId: chamada.id,
            conteudo:
              'Erro: o usuário não tem permissão para esta ação. Explique isso a ele e não tente de novo.',
          });
          continue;
        }

        if (ferramenta.escrita) {
          // Não executa. Grava a pendência e conta ao modelo o que aconteceu,
          // para ele redigir a resposta pedindo a confirmação.
          const resumo =
            ferramenta.resumir?.(chamada.argumentos) ?? ferramenta.nome;
          const pendente = await this.prisma.withTenant(empresaId, (tx) =>
            tx.agenteMensagem.create({
              data: {
                empresaId,
                conversaId,
                papel: 'ferramenta',
                ferramenta: ferramenta.nome,
                argumentos: chamada.argumentos as never,
                conteudo: resumo,
                pendente: true,
              },
            }),
          );
          pendencias.push({
            id: pendente.id,
            ferramenta: ferramenta.nome,
            resumo,
            argumentos: chamada.argumentos,
          });
          mensagens.push({
            papel: 'tool',
            chamadaId: chamada.id,
            conteudo:
              'A ação foi preparada e está aguardando confirmação do usuário na tela. ' +
              'Nada foi gravado ainda. Resuma o que será feito e peça a confirmação.',
          });
          continue;
        }

        const resultado = await this.executarLeitura(
          empresaId,
          conversaId,
          ferramenta.nome,
          chamada.argumentos,
          user,
        );
        mensagens.push({
          papel: 'tool',
          chamadaId: chamada.id,
          // Teto por resultado, e baixo de propósito: numa conversa que
          // encadeia 3–4 ferramentas o contexto acumula rápido, e provedor
          // com limite de tamanho por requisição responde 413 (aconteceu com
          // 12k por resultado). O modelo precisa do suficiente para resumir,
          // não do payload inteiro da tela.
          conteudo: this.resumirResultado(resultado),
        });
      }
    }

    if (textoFinal === null) {
      textoFinal =
        'Não consegui concluir o raciocínio dentro do limite de passos. ' +
        'Tente reformular a pergunta de forma mais direta.';
      await this.prisma.withTenant(empresaId, (tx) =>
        tx.agenteMensagem.create({
          data: {
            empresaId,
            conversaId,
            papel: 'assistente',
            conteudo: textoFinal,
          },
        }),
      );
    }

    await this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteConversa.update({
        where: { id: conversaId },
        data: { updatedAt: new Date() },
      }),
    );

    return { conversaId, texto: textoFinal, pendencias };
  }

  /**
   * Enxuga o resultado de uma ferramenta antes de devolvê-lo ao modelo.
   *
   * Listas paginadas são o caso que mais pesa: `posicao_cliente` traz notas,
   * títulos e mix inteiros. O modelo precisa dos primeiros itens para
   * responder, não do conjunto — e o banco continua sendo a fonte se o usuário
   * quiser a lista completa na tela.
   *
   * O resultado **completo** vai para `agente_mensagens.resultado`, então a
   * auditoria não perde nada com este corte.
   */
  private resumirResultado(resultado: unknown): string {
    const TETO = 4_000;
    const podarListas = (v: unknown, profundidade = 0): unknown => {
      if (Array.isArray(v)) {
        const cortada = v
          .slice(0, 8)
          .map((i) => podarListas(i, profundidade + 1));
        return v.length > 8
          ? [...cortada, `…mais ${v.length - 8} item(ns) omitidos`]
          : cortada;
      }
      if (v && typeof v === 'object' && profundidade < 4) {
        return Object.fromEntries(
          Object.entries(v as Record<string, unknown>).map(([k, val]) => [
            k,
            podarListas(val, profundidade + 1),
          ]),
        );
      }
      return v;
    };

    const texto = JSON.stringify(podarListas(resultado));
    return texto.length > TETO
      ? `${texto.slice(0, TETO)}…(resultado truncado)`
      : texto;
  }

  /**
   * Executa uma ferramenta de leitura, gravando a chamada para auditoria. Erro
   * de negócio (404, 403) volta ao modelo como resultado, não como exceção: o
   * agente precisa poder dizer "não encontrei esse cliente" em vez de a
   * requisição inteira falhar.
   */
  private async executarLeitura(
    empresaId: string,
    conversaId: string,
    nome: string,
    args: Record<string, unknown>,
    user: AuthenticatedUser,
  ): Promise<unknown> {
    let resultado: unknown;
    try {
      resultado = await this.tools.executar(nome, args, user);
    } catch (e) {
      resultado = {
        erro: e instanceof Error ? e.message : 'Falha ao executar a ferramenta',
      };
    }
    await this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteMensagem.create({
        data: {
          empresaId,
          conversaId,
          papel: 'ferramenta',
          ferramenta: nome,
          argumentos: args as never,
          // Guarda o que o modelo viu, não o payload cru: `posicao_cliente`
          // devolve ~400 KB por chamada, e a auditoria (o que foi consultado,
          // com quais argumentos, e o que embasou a resposta) não precisa da
          // lista inteira de notas para responder à pergunta que ela existe
          // para responder.
          resultado: { resumo: this.resumirResultado(resultado) } as never,
        },
      }),
    );
    return resultado;
  }

  /**
   * Confirma e executa de verdade uma ação de escrita. Revalida tudo: a
   * conversa é do usuário, a pendência existe, ainda não foi confirmada, e a
   * permissão continua valendo.
   */
  async confirmar(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    pendenciaId: string,
  ) {
    const pendencia = await this.prisma.withTenant(empresaId, async (tx) => {
      await this.minhaConversa(tx, empresaId, user, conversaId);
      const m = await tx.agenteMensagem.findFirst({
        where: { id: pendenciaId, empresaId, conversaId },
      });
      if (!m || !m.ferramenta) {
        throw new NotFoundException('Ação não encontrada nesta conversa');
      }
      if (!m.pendente) {
        throw new ConflictException('Esta ação já foi confirmada ou cancelada');
      }
      return m;
    });

    const ferramenta = this.tools.buscar(pendencia.ferramenta as string);
    if (!ferramenta) {
      throw new BadRequestException('Ferramenta não existe mais');
    }
    this.tools.garantirPermissao(ferramenta, user);

    const argumentos = (pendencia.argumentos ?? {}) as Record<string, unknown>;
    const resultado = await ferramenta.executar(argumentos, user);

    await this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteMensagem.update({
        where: { id: pendencia.id },
        data: {
          pendente: false,
          confirmadaEm: new Date(),
          confirmadaPor: user.id,
          resultado: resultado as never,
        },
      }),
    );

    return { executado: true, resultado };
  }

  /** Cancelar apenas fecha a pendência — nada foi gravado até aqui. */
  async cancelar(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    pendenciaId: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.minhaConversa(tx, empresaId, user, conversaId);
      const m = await tx.agenteMensagem.findFirst({
        where: { id: pendenciaId, empresaId, conversaId, pendente: true },
      });
      if (!m) throw new NotFoundException('Ação pendente não encontrada');
      await tx.agenteMensagem.update({
        where: { id: m.id },
        data: { pendente: false, conteudo: `${m.conteudo ?? ''} (cancelada)` },
      });
      return { cancelado: true };
    });
  }

  /**
   * System prompt da empresa + um bloco de contexto que o **servidor** monta.
   * O bloco é o que evita o agente inventar a data de hoje ou supor permissões
   * que o usuário não tem.
   */
  private async montarContexto(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    limite: number,
    systemPrompt: string | null,
  ): Promise<MensagemChat[]> {
    const historico = await this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteMensagem.findMany({
        where: {
          empresaId,
          conversaId,
          papel: { in: ['usuario', 'assistente'] },
          conteudo: { not: null },
        },
        orderBy: { criadaEm: 'desc' },
        take: limite,
      }),
    );

    const hoje = new Date().toLocaleDateString('pt-BR', {
      dateStyle: 'full',
      timeZone: 'America/Campo_Grande',
    });
    const ferramentas = this.tools
      .disponiveisPara(user)
      .map((f) => f.nome)
      .join(', ');

    const contexto = [
      systemPrompt?.trim() ||
        'Você é o assistente interno de um sistema comercial. Responda em português do Brasil, ' +
          'de forma direta e objetiva.',
      '',
      '--- Contexto desta sessão (fornecido pelo sistema, não pelo usuário) ---',
      `Usuário: ${user.nome} (${user.email}).`,
      `Data de hoje: ${hoje}.`,
      `Ferramentas liberadas para este usuário: ${ferramentas || 'nenhuma'}.`,
      'Você só enxerga dados da carteira de clientes que este usuário alcança — ' +
        'se uma busca não retorna nada, diga que não encontrou, não suponha que o dado não existe.',
      'Ações que gravam exigem confirmação do usuário na tela; nunca afirme que gravou algo ' +
        'antes de receber a confirmação.',
      'Nunca invente número, valor ou código: se não veio de uma ferramenta, diga que não sabe.',
    ].join('\n');

    return [
      { papel: 'system', conteudo: contexto },
      ...historico.reverse().map<MensagemChat>((m) => ({
        papel: m.papel === 'usuario' ? 'user' : 'assistant',
        conteudo: m.conteudo,
      })),
    ];
  }
}
