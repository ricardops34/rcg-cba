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
import { AgenteFerramentasService } from './agente-ferramentas.service';
import { AgenteReferenciasService } from './agente-referencias.service';
import { AgenteToolsService } from './agente-tools.service';
import { garantirMascarado, mascarar } from './anonimizar-agente';
import { ProvedorFactory } from './provedor.factory';
import type { FiltroFerramentas } from './agente-ferramentas.service';
import type { Ferramenta } from './agente-tools.service';
import type { AgenteDestino } from '@plataforma/contracts';
import type { MensagemChat } from './provedor-ia';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Quantos botões "abrir na tela" uma resposta pode carregar.
 *
 * Dois. O terceiro já não é atalho: vira uma fileira de opções que quem
 * perguntou tem de ler e escolher, logo abaixo de um texto que ele ainda está
 * lendo — e a resposta some atrás dos botões na janela estreita do assistente.
 */
const MAX_DESTINOS = 2;

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
    private readonly referencias: AgenteReferenciasService,
    private readonly governanca: AgenteFerramentasService,
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
    const { conversa, mensagens } = await this.prisma.withTenant(
      empresaId,
      async (tx) => ({
        conversa: await this.minhaConversa(tx, empresaId, user, id),
        mensagens: await tx.agenteMensagem.findMany({
          where: { empresaId, conversaId: id },
          orderBy: { criadaEm: 'asc' },
        }),
      }),
    );

    // As respostas do assistente estão gravadas com as referências opacas
    // (ver `enviar`). Remonta todas numa rodada só de consultas.
    const conteudos = await this.referencias.remontarVarios(
      empresaId,
      mensagens.map((m) => m.conteudo),
    );

    return {
      id: conversa.id,
      titulo: conversa.titulo,
      mensagens: mensagens.map((m, i) => ({
        id: m.id,
        papel: m.papel,
        conteudo: conteudos[i],
        ferramenta: m.ferramenta,
        pendente: m.pendente,
        confirmadaEm: m.confirmadaEm,
        criadaEm: m.criadaEm,
      })),
    };
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

    // Configuração da empresa (ferramenta ligada/desligada, descrição
    // reescrita, perfis liberados). Restringe o catálogo; nunca o amplia.
    // Precisa vir antes do contexto: é ele que lista ao modelo o que está
    // liberado, e a lista tem de bater com o catálogo enviado.
    const filtro = await this.governanca.filtroPara(empresaId, user);

    const mensagens = await this.montarContexto(
      empresaId,
      user,
      conversaId,
      cfg.historicoMensagens,
      cfg.systemPrompt,
      filtro,
      cfg.nomeAgente,
    );

    const ferramentas = this.tools.paraProvedor(user, filtro);
    const pendencias: Pendencia[] = [];
    // Telas que o turno tocou. Acumula ao longo das voltas: uma pergunta pode
    // encadear buscar_cliente e posicao_cliente, e o botão que interessa é o
    // da última — mas os dois são legítimos.
    const destinos: AgenteDestino[] = [];
    let textoFinal: string | null = null;

    for (let volta = 0; volta < cfg.maxIteracoesFerramentas; volta++) {
      const resposta = await this.provedores.para(cfg.provedor).conversar({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        contaId: cfg.contaId,
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
        // Formato nativo do provedor, quando ele exige os itens de volta na
        // próxima volta — ver `MensagemChat.bruto`. Vazio nos demais.
        bruto: resposta.bruto,
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
        // Vale a permissão E a configuração: uma ferramenta desligada não
        // está no catálogo enviado, mas o modelo pode inventá-la a partir do
        // histórico, e a checagem de permissão sozinha a deixaria passar.
        const liberadas = this.tools.disponiveisPara(user, filtro);
        try {
          this.tools.garantirPermissao(ferramenta, user);
          if (!liberadas.some((l) => l.nome === ferramenta.nome)) {
            throw new Error('desligada para esta empresa');
          }
        } catch {
          mensagens.push({
            papel: 'tool',
            chamadaId: chamada.id,
            conteudo:
              'Erro: o usuário não tem permissão para esta ação. Explique isso a ele e não tente de novo.',
          });
          continue;
        }

        // O modelo enxerga o cliente como `«CLI:1234»`, então é natural que ele
        // devolva a referência onde a ferramenta espera um id. Traduz antes de
        // executar — inclusive na escrita, para a pendência gravar o id real.
        const argumentos = await this.referencias.resolverIds(
          empresaId,
          chamada.argumentos,
        );

        if (ferramenta.escrita) {
          // Não executa. Grava a pendência e conta ao modelo o que aconteceu,
          // para ele redigir a resposta pedindo a confirmação.
          const resumo = ferramenta.resumir?.(argumentos) ?? ferramenta.nome;
          const pendente = await this.prisma.withTenant(empresaId, (tx) =>
            tx.agenteMensagem.create({
              data: {
                empresaId,
                conversaId,
                papel: 'ferramenta',
                ferramenta: ferramenta.nome,
                argumentos: argumentos as never,
                conteudo: resumo,
                pendente: true,
              },
            }),
          );
          pendencias.push({
            id: pendente.id,
            ferramenta: ferramenta.nome,
            resumo,
            argumentos,
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
          argumentos,
          user,
        );
        destinos.push(...this.destinosDe(ferramenta, argumentos, resultado));
        mensagens.push({
          papel: 'tool',
          chamadaId: chamada.id,
          // Teto por resultado, e baixo de propósito: numa conversa que
          // encadeia 3–4 ferramentas o contexto acumula rápido, e provedor
          // com limite de tamanho por requisição responde 413 (aconteceu com
          // 12k por resultado). O modelo precisa do suficiente para resumir,
          // não do payload inteiro da tela.
          conteudo: this.resumirResultado(resultado, ferramenta.limiteItens),
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

    // A mensagem fica gravada **mascarada**, e é assim que ela volta ao modelo
    // no próximo turno (`montarContexto`) — gravar o nome real aqui vazaria
    // pela porta dos fundos, no histórico. Quem lê é que recebe remontado.
    return {
      conversaId,
      texto: await this.referencias.remontarTexto(empresaId, textoFinal),
      pendencias,
      destinos: this.semRepetir(destinos),
    };
  }

  /**
   * Os botões "abrir na tela" de uma execução de ferramenta.
   *
   * Erro aqui não pode derrubar a conversa: o destino é conveniência, e uma
   * ferramenta cujo resultado veio em formato inesperado ainda respondeu a
   * pergunta. Falhou, fica sem botão.
   */
  private destinosDe(
    ferramenta: Ferramenta,
    args: Record<string, unknown>,
    resultado: unknown,
  ): AgenteDestino[] {
    try {
      const d = ferramenta.destino?.(args, resultado);
      if (!d) return [];
      return Array.isArray(d) ? d : [d];
    } catch {
      return [];
    }
  }

  /**
   * Os botões que sobram no fim do turno.
   *
   * Três cortes, nesta ordem, porque o turno acumula um destino por ferramenta
   * executada e uma pergunta encadeia três ou quatro:
   *
   * 1. mesma rota citada duas vezes vira um botão só;
   * 2. mesmo **rótulo** em rotas diferentes também — `minha_agenda` com e sem
   *    `clienteId` produzia dois "Abrir a agenda" lado a lado, e quem lê não
   *    tem como saber qual é qual;
   * 3. sobra o teto de dois botões, ficando com os **últimos**: a ordem é a da
   *    execução, e a última ferramenta é a que respondeu a pergunta — o
   *    `buscar_cliente` que veio antes só serviu para achar o id.
   */
  private semRepetir(destinos: AgenteDestino[]): AgenteDestino[] {
    const porRota = new Map(destinos.map((d) => [d.rota, d]));
    const porRotulo = new Map([...porRota.values()].map((d) => [d.rotulo, d]));
    return [...porRotulo.values()].slice(-MAX_DESTINOS);
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
  private resumirResultado(resultado: unknown, limiteItens = 8): string {
    const TETO = 4_000;
    // A mascaração vem **antes** da poda e do corte: cortar primeiro poderia
    // partir uma referência ao meio (`«CLI:12`), e o modelo passaria a citar
    // um código que a remontagem não reconhece.
    const mascarado = mascarar(resultado);
    const podarListas = (v: unknown, profundidade = 0): unknown => {
      if (Array.isArray(v)) {
        const cortada = v
          .slice(0, limiteItens)
          .map((i) => podarListas(i, profundidade + 1));
        return v.length > limiteItens
          ? [...cortada, `…mais ${v.length - limiteItens} item(ns) omitidos`]
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

    const texto = JSON.stringify(podarListas(mascarado));
    // Cinto e suspensório: se um campo de identificação escapou da mascaração,
    // falha a resposta em vez de mandá-lo ao provedor.
    garantirMascarado(texto);

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
          resultado: {
            resumo: this.resumirResultado(
              resultado,
              this.tools.buscar(nome)?.limiteItens,
            ),
          } as never,
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

    // O que acabou de ser gravado tem tela: o orçamento novo, ou a fila de
    // aprovação onde a alteração de cadastro foi parar.
    return {
      executado: true,
      resultado,
      destinos: this.semRepetir(
        this.destinosDe(ferramenta, argumentos, resultado),
      ),
    };
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
    filtro: FiltroFerramentas,
    nomeAgente: string,
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
      .disponiveisPara(user, filtro)
      .map((f) => f.nome)
      .join(', ');

    const contexto = [
      `Seu nome é ${nomeAgente}.`,
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
      '',
      'Nomes de cliente, de produto e de vendedor NÃO são enviados a você. No lugar deles ' +
        'vêm referências no formato «CLI:código», «PRD:código» e «VND:código». Escreva essas ' +
        'referências na sua resposta exatamente como as recebeu, incluindo as aspas angulares: ' +
        'o sistema troca cada uma pelo nome real antes de o usuário ler. Nunca invente uma ' +
        'referência, nunca traduza para um nome que você imagina, e nunca explique ao usuário ' +
        'que está usando códigos — para ele, a resposta sai com os nomes normalmente.',
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
