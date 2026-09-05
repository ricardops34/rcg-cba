import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TenantTx } from '../../../common/prisma/prisma.service';
import { AgenteConfigService } from '../../agente/agente-config.service';
import { ProvedorFactory } from '../../agente/provedor.factory';
import type { MensagemChat } from '../../agente/provedor-ia';
import { ferramentasDaTriagem } from './triagem-ferramentas';
import { montarPromptTriagem, montarPromptFuncionario } from './triagem-prompt';
import { FERRAMENTAS_DO_FUNCIONARIO } from './triagem-ferramentas-funcionario';
import { WhatsappFuncionarioService } from './whatsapp-funcionario.service';
import { TriagemFuncionarioToolsService } from './triagem-funcionario-tools.service';
import {
  resolverEscopoDoUsuario,
  type EscopoVendedores,
} from '../../../common/escopo/escopo-vendedores';
import { jidBrasileiro, sufixoTelefone } from './telefone-equipe';
import { WhatsappProviderService } from '../providers/whatsapp-provider.service';
import { dentroDoExpediente } from '../../../common/horario/horario-trabalho';
import {
  registrarNotificacao,
  usuarioDoVendedor,
} from '../../notificacoes/registrar-notificacao';

/** Quantas voltas de ferramenta uma resposta pode dar antes de desistir. */
const MAX_VOLTAS = 4;

/** Quantas mensagens da conversa vão como histórico ao modelo. */
const HISTORICO = 12;

/**
 * Assinatura das mensagens que a IA escreve.
 *
 * Vai no `enviadaPor`, que nas mensagens de gente guarda o id do usuário. Um
 * marcador em vez de um uuid porque não há usuário nenhum aqui — e deixar nulo
 * faria a mensagem da IA parecer do sistema no histórico.
 */
const AUTOR_TRIAGEM = 'triagem-ia';

/**
 * Minutos de inatividade a partir dos quais a sessao deixa de contar como
 * presenca. Quem fechou o navegador ha uma hora nao vai ver a conversa chegar.
 */
const PRESENCA_MIN = 30;

/**
 * Autoria dos avisos que a IA manda para a equipe. Separada de AUTOR_TRIAGEM
 * porque e o que conta contra o teto — e porque no historico da conversa
 * "avisei o vendedor" nao e a mesma coisa que "respondi ao cliente".
 */
const AUTOR_AVISO = 'triagem-ia-aviso';

/**
 * Quantos avisos a IA pode disparar numa mesma conversa.
 *
 * Sem teto, um cliente insistente (ou alguem tentando) viraria uma rajada no
 * celular de todo mundo. Tres cobre "avisei, nao vieram, avisei a supervisao".
 */
const MAX_AVISOS_POR_CONVERSA = 3;

/**
 * Triagem do número institucional.
 *
 * O que ela faz, em uma frase: recebe a mensagem que chegou no WhatsApp da
 * empresa, responde o que dá para responder, e entrega a conversa a uma pessoa.
 *
 * Do outro lado pode estar um **cliente** ou um **funcionário**, e a diferença
 * decide tudo o que vem depois: o prompt, o catálogo de ferramentas e o recorte
 * dos dados. Cliente é reconhecido pelo vínculo do número com o cadastro;
 * funcionário, pelo telefone no cadastro de vendedores **mais** um código que
 * ele confirmou (ver `WhatsappFuncionarioService`). Os dois nunca se misturam.
 *
 * **O que ela não é:** o agente interno (`AgenteChatService`). Aquele conversa
 * com um funcionário **logado** e recorta ferramentas por perfil RBAC, o que
 * permite criar e alterar. Aqui não há login — só um número confirmado —, e por
 * isso o funcionário só consulta. Compartilham a camada de provedor de IA, que
 * é onde de fato não há diferença.
 */
@Injectable()
export class WhatsappTriagemService {
  private readonly logger = new Logger(WhatsappTriagemService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agenteConfig: AgenteConfigService,
    private readonly provedores: ProvedorFactory,
    private readonly provider: WhatsappProviderService,
    private readonly funcionarios: WhatsappFuncionarioService,
    private readonly funcionarioTools: TriagemFuncionarioToolsService,
  ) {}

  /**
   * Processa uma mensagem recebida no número institucional.
   *
   * **Nunca lança.** É chamada de dentro do fluxo de recebimento: uma exceção
   * aqui derrubaria a gravação da mensagem do cliente, que é o dado que não
   * pode se perder. Falha vira log e a conversa fica aguardando uma pessoa —
   * que é o pior caso aceitável: alguém atende.
   */
  async processar(entrada: {
    empresaId: string;
    conversaId: string;
    texto: string | null;
  }): Promise<void> {
    try {
      await this.executar(entrada);
    } catch (erro) {
      this.logger.error(
        `Triagem falhou na conversa ${entrada.conversaId}: ${
          erro instanceof Error ? erro.message : String(erro)
        }`,
      );
      // Sai do bot e cai na fila: melhor uma pessoa atendendo do que uma
      // conversa presa num robô que não responde.
      await this.paraFila(
        entrada.empresaId,
        entrada.conversaId,
        'Triagem automática indisponível',
      ).catch(() => undefined);
    }
  }

  /**
   * Tira a conversa do bot e deixa na fila, sem dono.
   *
   * O caminho de saída de tudo que impede a IA de atender: triagem desligada,
   * agente sem configuração, falha do provedor. Em todos, o resultado tem de
   * ser o mesmo — a conversa **não pode ficar em `bot`**, porque ali ela não
   * aparece para ninguém e o cliente espera sem que exista fila.
   *
   * Avisa a equipe pelo mesmo caminho de um direcionamento normal: quem está
   * trabalhando precisa saber que chegou alguém, ainda mais quando não houve
   * triagem para explicar o assunto.
   */
  private async paraFila(empresaId: string, conversaId: string, motivo: string) {
    await this.prisma.withTenant(empresaId, async (tx) => {
      await tx.whatsappConversa.update({
        where: { id: conversaId },
        data: {
          atendimento: 'aguardando',
          assunto: motivo,
          direcionadaEm: new Date(),
        },
      });
      await this.avisarAguardando(tx, empresaId, conversaId, {
        vendedorId: null,
        assunto: motivo,
      });
    });
  }

  private async executar(entrada: {
    empresaId: string;
    conversaId: string;
    texto: string | null;
  }): Promise<void> {
    const { empresaId, conversaId } = entrada;

    const contexto = await this.carregarContexto(empresaId, conversaId);
    if (!contexto) return;

    // Triagem desligada em Administração > WhatsApp: a mensagem entra e vai
    // direto para a fila, sem bot no meio. É o interruptor da empresa que não
    // quer atendimento automático, e desligá-lo não pode deixar a conversa
    // presa em `bot` — ali ela não aparece para ninguém.
    if (!contexto.iaAtiva) {
      await this.paraFila(empresaId, conversaId, 'Atendimento automático desligado');
      return;
    }

    // Funcionário e cliente não se misturam. Quem é reconhecido no cadastro de
    // vendedores não recebe as ferramentas de cliente nem a saudação de
    // atendimento — ele não está comprando, está trabalhando.
    const identidade = await this.prisma.withTenant(empresaId, (tx) =>
      this.funcionarios.identificar(tx, empresaId, contexto.telefoneContato),
    );

    if (identidade.tipo !== 'desconhecido') {
      // Falha no atendimento a funcionário **não** vai para a fila.
      //
      // A fila é de cliente esperando. Um vendedor perguntando quanto tem
      // vencido, ou confirmando o número dele, não é alguém para outra pessoa
      // atender — mandar isso para lá cria trabalho falso e faz alguém abrir a
      // conversa para descobrir que não havia nada a fazer. A conversa fica em
      // `bot`, e a próxima mensagem tenta de novo.
      try {
        if (identidade.tipo === 'funcionario_pendente') {
          await this.parear(empresaId, conversaId, identidade, entrada.texto);
        } else {
          await this.atenderFuncionario(
            empresaId,
            conversaId,
            contexto,
            identidade,
          );
        }
      } catch (erro) {
        this.logger.error(
          `Atendimento a funcionário falhou na conversa ${conversaId}: ${
            erro instanceof Error ? erro.message : String(erro)
          }`,
        );
      }
      return;
    }

    // A saudação sai **antes** de a IA pensar, e sai mesmo que a IA falhe
    // logo depois: quem escreveu para a empresa merece uma resposta imediata,
    // e essa resposta é a única que não depende de provedor nenhum estar no ar.
    //
    // Não passa pelo modelo de propósito: é o texto que a empresa quer que o
    // cliente leia. Deixar a IA compô-la faria a mesma empresa soar diferente
    // a cada conversa.
    if (contexto.saudacao && !contexto.jaSaudou) {
      await this.saudar(empresaId, conversaId, contexto.saudacao);
    }

    // O agente de IA é o mesmo da empresa (Administração > Agente IA):
    // provedor, chave e modelo saem dali. Desligado, a triagem não tem com o
    // que pensar — e a conversa vai para uma pessoa, com o motivo dito em vez
    // de virar uma exceção genérica no log.
    let cfg;
    try {
      cfg = await this.agenteConfig.paraUso(empresaId);
    } catch {
      this.logger.warn(
        `Triagem sem agente de IA configurado na empresa ${empresaId}; conversa ${conversaId} foi para a fila.`,
      );
      await this.paraFila(
        empresaId,
        conversaId,
        'Atendimento automático indisponível (agente de IA desativado)',
      );
      return;
    }
    const ferramentas = ferramentasDaTriagem(contexto.clienteId !== null);

    const mensagens: MensagemChat[] = [
      {
        papel: 'system',
        conteudo: montarPromptTriagem({
          nomeEmpresa: contexto.nomeEmpresa,
          cliente: contexto.clienteId
            ? {
                nome: contexto.clienteNome ?? 'sem nome',
                vendedor: contexto.vendedorDaCarteiraNome,
              }
            : null,
          informacoes: contexto.informacoes,
          vendedoresPresentes: contexto.presentes,
        }),
      },
      ...contexto.historico,
    ];

    let respostaAoCliente: string | null = null;

    for (let volta = 0; volta < MAX_VOLTAS; volta++) {
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
        respostaAoCliente = resposta.texto;
        break;
      }

      mensagens.push({
        papel: 'assistant',
        conteudo: resposta.texto,
        chamadas: resposta.chamadas,
        bruto: resposta.bruto,
      });

      let direcionou = false;
      for (const chamada of resposta.chamadas) {
        const r = await this.executarFerramenta(
          empresaId,
          conversaId,
          contexto,
          chamada.nome,
          chamada.argumentos,
        );
        mensagens.push({
          papel: 'tool',
          chamadaId: chamada.id,
          conteudo: JSON.stringify(r.resultado),
        });
        if (r.direcionou) direcionou = true;
      }

      // Depois de direcionar, o modelo não fala mais: quem continua é a
      // pessoa. Deixar a volta seguinte acontecer faria a IA responder por
      // cima de quem acabou de assumir.
      if (direcionou) {
        respostaAoCliente = resposta.texto;
        break;
      }
    }

    if (respostaAoCliente?.trim()) {
      await this.responder(empresaId, conversaId, respostaAoCliente.trim());
    }
  }

  /** O que a triagem precisa saber para responder. Null quando não se aplica. */
  private async carregarContexto(empresaId: string, conversaId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const conversa = await tx.whatsappConversa.findFirst({
        where: { id: conversaId },
        select: {
          id: true,
          clienteId: true,
          atendimento: true,
          saudadoEm: true,
          sessao: { select: { tipo: true } },
          // O telefone é o que reconhece um funcionário. `telefoneNormalizado`
          // pode vir nulo em contato antigo, então o jid entra como reserva —
          // é dele que o número sai, afinal.
          contato: { select: { telefoneNormalizado: true, jid: true } },
          cliente: {
            select: {
              nomeFantasia: true,
              razaoSocial: true,
              vendedor: { select: { id: true, nome: true } },
            },
          },
          mensagens: {
            orderBy: { criadaEm: 'desc' },
            take: HISTORICO,
            select: { direcao: true, conteudo: true },
          },
        },
      });

      // Só o número institucional passa pela triagem, e só enquanto está com o
      // bot. Conversa já direcionada é de quem assumiu.
      if (!conversa) return null;
      if (conversa.sessao.tipo !== 'empresa') return null;
      if (conversa.atendimento !== 'bot') return null;

      const [empresa, config] = await Promise.all([
        tx.empresa.findFirst({
          where: { id: empresaId },
          select: { nomeFantasia: true },
        }),
        tx.whatsappConfig.findUnique({
          where: { empresaId },
          select: {
            atendimentoInformacoes: true,
            atendimentoIaAtivo: true,
            atendimentoSaudacao: true,
          },
        }),
      ]);

      const historico: MensagemChat[] = conversa.mensagens
        .slice()
        .reverse()
        .filter((m) => (m.conteudo ?? '').trim().length > 0)
        .map((m) => ({
          papel: m.direcao === 'entrada' ? ('user' as const) : ('assistant' as const),
          conteudo: m.conteudo,
        }));

      return {
        clienteId: conversa.clienteId,
        clienteNome:
          conversa.cliente?.nomeFantasia ?? conversa.cliente?.razaoSocial ?? null,
        vendedorDaCarteiraId: conversa.cliente?.vendedor?.id ?? null,
        vendedorDaCarteiraNome: conversa.cliente?.vendedor?.nome ?? null,
        nomeEmpresa: empresa?.nomeFantasia ?? 'nossa empresa',
        informacoes: config?.atendimentoInformacoes ?? null,
        iaAtiva: config?.atendimentoIaAtivo === true,
        saudacao: config?.atendimentoSaudacao?.trim() || null,
        jaSaudou: conversa.saudadoEm !== null,
        telefoneContato:
          conversa.contato.telefoneNormalizado ?? conversa.contato.jid,
        presentes: await this.vendedoresPresentes(tx, empresaId),
        historico,
      };
    });
  }

  private async executarFerramenta(
    empresaId: string,
    conversaId: string,
    contexto: NonNullable<Awaited<ReturnType<WhatsappTriagemService['carregarContexto']>>>,
    nome: string,
    argumentos: Record<string, unknown>,
  ): Promise<{ resultado: unknown; direcionou: boolean }> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      switch (nome) {
        case 'titulos_em_aberto':
          return {
            resultado: await this.titulosEmAberto(tx, empresaId, contexto.clienteId),
            direcionou: false,
          };

        case 'ultimas_notas':
          return {
            resultado: await this.ultimasNotas(
              tx,
              empresaId,
              contexto.clienteId,
              Number(argumentos.quantidade) || 5,
            ),
            direcionou: false,
          };

        case 'identificar_cliente':
          return {
            resultado: await this.identificarCliente(tx, empresaId, argumentos),
            direcionou: false,
          };

        case 'procurar_vendedor':
          return {
            resultado: await this.procurarVendedor(
              tx,
              empresaId,
              String(argumentos.nome ?? ''),
            ),
            direcionou: false,
          };

        case 'direcionar_para_vendedor':
          return {
            resultado: await this.direcionar(tx, empresaId, conversaId, {
              vendedorId:
                (argumentos.vendedorId as string | undefined) ??
                contexto.vendedorDaCarteiraId ??
                null,
              assunto: String(argumentos.assunto ?? 'Atendimento'),
              administrativo: false,
            }),
            direcionou: true,
          };

        case 'avisar_equipe':
          return {
            resultado: await this.avisarEquipe(tx, empresaId, conversaId, {
              destino: String(argumentos.destino ?? 'vendedor'),
              vendedorId:
                (argumentos.vendedorId as string | undefined) ??
                contexto.vendedorDaCarteiraId ??
                null,
              mensagem: String(argumentos.mensagem ?? ''),
              cliente: contexto.clienteNome,
            }),
            direcionou: false,
          };

        case 'direcionar_para_administrativo':
          return {
            resultado: await this.direcionar(tx, empresaId, conversaId, {
              vendedorId: null,
              assunto: String(argumentos.assunto ?? 'Atendimento'),
              administrativo: true,
            }),
            direcionou: true,
          };

        default:
          return {
            resultado: { erro: `Ferramenta desconhecida: ${nome}` },
            direcionou: false,
          };
      }
    });
  }

  /**
   * Títulos em aberto — recortados pelo cliente **da conversa**, e não por um
   * id que o modelo informe. É a diferença entre o bot consultar o financeiro
   * de quem está falando e consultar o de quem ele disser.
   */
  private async titulosEmAberto(
    tx: TenantTx,
    empresaId: string,
    clienteId: string | null,
  ) {
    if (!clienteId) return { erro: 'Número não associado a cliente' };
    const linhas = await tx.tituloReceber.findMany({
      where: {
        empresaId,
        clienteId,
        deletedAt: null,
        ativo: true,
        dtBaixa: null,
      },
      orderBy: { vencimento: 'asc' },
      take: 20,
      select: {
        numero: true,
        parcela: true,
        vencimento: true,
        valor: true,
        saldo: true,
      },
    });
    const hoje = new Date();
    return {
      quantidade: linhas.length,
      titulos: linhas.map((t) => ({
        numero: t.numero,
        parcela: t.parcela,
        vencimento: t.vencimento?.toISOString().slice(0, 10) ?? null,
        valor: Number(t.saldo ?? t.valor),
        vencido: t.vencimento ? t.vencimento < hoje : false,
      })),
    };
  }

  private async ultimasNotas(
    tx: TenantTx,
    empresaId: string,
    clienteId: string | null,
    quantidade: number,
  ) {
    if (!clienteId) return { erro: 'Número não associado a cliente' };
    const linhas = await tx.notaSaida.findMany({
      where: { empresaId, clienteId, deletedAt: null },
      orderBy: { dtEmissao: 'desc' },
      take: Math.min(Math.max(quantidade, 1), 10),
      select: {
        numero: true,
        serie: true,
        dtEmissao: true,
        vlrBruto: true,
      },
    });
    return {
      quantidade: linhas.length,
      notas: linhas.map((n) => ({
        numero: n.numero,
        serie: n.serie,
        emissao: n.dtEmissao?.toISOString().slice(0, 10) ?? null,
        valor: Number(n.vlrBruto ?? 0),
      })),
    };
  }

  /**
   * Confere se existe cliente com aquele documento ou nome — e devolve **só o
   * suficiente para direcionar**.
   *
   * Não devolve endereço, limite, telefone nem histórico: quem está do outro
   * lado ainda não provou ser daquela empresa, e um número desconhecido
   * digitando CNPJs não pode virar uma consulta de cadastro alheio.
   */
  private async identificarCliente(
    tx: TenantTx,
    empresaId: string,
    argumentos: Record<string, unknown>,
  ) {
    const documento = String(argumentos.documento ?? '').replace(/\D/g, '');
    const nome = String(argumentos.nome ?? '').trim();
    if (!documento && nome.length < 3) {
      return { encontrado: false, motivo: 'Informe o CNPJ/CPF ou o nome' };
    }

    const cliente = await tx.cliente.findFirst({
      where: {
        empresaId,
        deletedAt: null,
        ativo: true,
        ...(documento
          ? { cnpjCpf: documento }
          : {
              OR: [
                { razaoSocial: { contains: nome, mode: 'insensitive' } },
                { nomeFantasia: { contains: nome, mode: 'insensitive' } },
              ],
            }),
      },
      select: {
        nomeFantasia: true,
        razaoSocial: true,
        vendedor: { select: { id: true, nome: true } },
      },
    });

    if (!cliente) return { encontrado: false };
    return {
      encontrado: true,
      nome: cliente.nomeFantasia ?? cliente.razaoSocial,
      vendedor: cliente.vendedor
        ? { id: cliente.vendedor.id, nome: cliente.vendedor.nome }
        : null,
    };
  }

  /**
   * Manda um recado da IA para quem trabalha na empresa, pelo número
   * institucional.
   *
   * **Os limites aqui não são zelo: são a diferença entre uma ferramenta útil
   * e um megafone nas mãos de quem estiver do outro lado.** Quem conversa com
   * a IA é um desconhecido, e texto de desconhecido chega ao modelo — se ele
   * pudesse escolher o número de destino, bastaria pedir "manda uma mensagem
   * para 6799…" para transformar o WhatsApp da empresa em disparador.
   *
   * Por isso:
   *
   * - o destino é um **papel** (vendedor da carteira, supervisão), nunca um
   *   número que o modelo informe. O telefone sai do cadastro;
   * - só quem tem vínculo ativo na empresa recebe;
   * - o recado vai **assinado como automático** e com o nome de quem o
   *   provocou, para ninguém confundir com mensagem de um colega;
   * - há teto por conversa: sem ele, um cliente insistente viraria uma rajada
   *   de avisos no celular de todo mundo.
   */
  private async avisarEquipe(
    tx: TenantTx,
    empresaId: string,
    conversaId: string,
    aviso: {
      destino: string;
      vendedorId: string | null;
      mensagem: string;
      cliente: string | null;
    },
  ) {
    const texto = aviso.mensagem.trim();
    if (texto.length < 5) {
      return { enviado: false, motivo: 'Mensagem vazia' };
    }

    const jaEnviados = await tx.whatsappMensagem.count({
      where: {
        conversaId,
        enviadaPor: AUTOR_AVISO,
      },
    });
    if (jaEnviados >= MAX_AVISOS_POR_CONVERSA) {
      return {
        enviado: false,
        motivo:
          'Limite de avisos desta conversa atingido. A equipe já foi notificada.',
      };
    }

    const destinatarios =
      aviso.destino === 'supervisao'
        ? await tx.vendedor.findMany({
            where: { empresaId, deletedAt: null, ativo: true, tipo: 'superior' },
            select: { id: true, nome: true, telefone: true },
          })
        : aviso.vendedorId
          ? await tx.vendedor.findMany({
              where: {
                id: aviso.vendedorId,
                empresaId,
                deletedAt: null,
                ativo: true,
              },
              select: { id: true, nome: true, telefone: true },
            })
          : [];

    if (destinatarios.length === 0) {
      return { enviado: false, motivo: 'Nenhum destinatário encontrado' };
    }

    const sessao = await tx.whatsappSessao.findFirst({
      where: { empresaId, tipo: 'empresa', status: 'conectada' },
      select: { id: true },
    });
    if (!sessao) {
      return { enviado: false, motivo: 'O número da empresa não está conectado' };
    }

    const assinatura = aviso.cliente
      ? `[automático] ${aviso.cliente}: `
      : '[automático] ';

    const enviados: string[] = [];
    for (const destinatario of destinatarios) {
      // O telefone da equipe é o do **cadastro de vendedores**, e não o do
      // vínculo com a empresa.
      //
      // Era lido de `usuario_empresas.celular/telefone` até 2026-09-04, e o
      // efeito era silencioso: aquelas colunas estão vazias (0 de 10 vínculos
      // na base de dev, contra 9 de 10 vendedores com telefone), então todo
      // destinatário era pulado e o aviso nunca saía — a ferramenta devolvia
      // "ninguém tem celular cadastrado" e a IA acreditava.
      const jid = jidBrasileiro(destinatario.telefone);
      if (!jid) continue;

      try {
        await this.provider.enviarTexto(
          empresaId,
          sessao.id,
          { jid, texto: assinatura + texto },
          tx,
        );
        enviados.push(destinatario.nome);
      } catch {
        // Um destinatário sem WhatsApp não pode impedir os outros de receber.
        continue;
      }
    }

    if (enviados.length === 0) {
      return {
        enviado: false,
        motivo: 'Nenhum destinatário tem celular cadastrado com WhatsApp',
      };
    }

    // Registra na conversa, com autor próprio, para contar contra o teto e
    // para quem abrir o histórico ver que o aviso saiu.
    await tx.whatsappMensagem.create({
      data: {
        empresaId,
        conversaId,
        externoId: `aviso-${Date.now()}`,
        direcao: 'saida',
        tipo: 'texto',
        conteudo: `Aviso enviado a ${enviados.join(', ')}: ${texto}`,
        enviadaPor: AUTOR_AVISO,
        statusEntrega: 'enviada',
      },
    });

    return { enviado: true, para: enviados };
  }

  /**
   * Quem está de fato atendendo agora.
   *
   * Duas condições, e as duas são necessárias:
   *
   * 1. **Em expediente** — o horário cadastrado do usuário (`UsuarioHorario`,
   *    o mesmo que barra o login fora de hora). Quem não restringe horário
   *    conta como em expediente sempre: é o padrão do cadastro, e tratá-lo
   *    como fechado faria a empresa que nunca configurou parecer fechada o
   *    tempo todo.
   * 2. **Presente no sistema** — sessão aberta com atividade recente. Estar no
   *    horário não é estar trabalhando: quem não entrou hoje não vai ver a
   *    conversa chegar, e direcionar para ele é o mesmo que não direcionar.
   *
   * Serve para a IA **avisar** o cliente, não para recusar atendimento: a
   * conversa é direcionada de qualquer forma e espera na fila. O que se evita
   * é prometer resposta imediata às 23h de um sábado.
   */
  private async vendedoresPresentes(
    tx: TenantTx,
    empresaId: string,
    agora = new Date(),
  ): Promise<{ vendedorId: string; nome: string }[]> {
    const vendedores = await tx.vendedor.findMany({
      where: {
        empresaId,
        deletedAt: null,
        ativo: true,
        usuarioId: { not: null },
      },
      select: { id: true, nome: true, usuarioId: true },
    });
    const usuarioIds = vendedores
      .map((v) => v.usuarioId)
      .filter((id): id is string => id !== null);
    if (usuarioIds.length === 0) return [];

    const desde = new Date(agora.getTime() - PRESENCA_MIN * 60_000);
    const [usuarios, sessoes] = await Promise.all([
      tx.usuario.findMany({
        where: { id: { in: usuarioIds }, ativo: true, deletedAt: null },
        select: {
          id: true,
          restringirHorario: true,
          horarios: {
            select: { diaSemana: true, horaInicio: true, horaFim: true },
          },
        },
      }),
      // `sessoes` não tem RLS (ver o README de migrations): é escrita no login,
      // antes de existir empresa ativa. O corte por empresa vem do `where`.
      tx.sessao.findMany({
        where: {
          usuarioId: { in: usuarioIds },
          empresaId,
          encerradaEm: null,
          ultimaAtividadeEm: { gte: desde },
        },
        select: { usuarioId: true },
      }),
    ]);

    const presentes = new Set(sessoes.map((s) => s.usuarioId));
    const emExpediente = new Set(
      usuarios
        .filter(
          (u) => dentroDoExpediente(u.restringirHorario, u.horarios, agora).dentro,
        )
        .map((u) => u.id),
    );

    return vendedores
      .filter(
        (v) =>
          v.usuarioId !== null &&
          presentes.has(v.usuarioId) &&
          emExpediente.has(v.usuarioId),
      )
      .map((v) => ({ vendedorId: v.id, nome: v.nome }));
  }

  private async procurarVendedor(tx: TenantTx, empresaId: string, nome: string) {
    if (nome.trim().length < 2) return { encontrados: [] };
    const linhas = await tx.vendedor.findMany({
      where: {
        empresaId,
        deletedAt: null,
        ativo: true,
        nome: { contains: nome.trim(), mode: 'insensitive' },
      },
      take: 5,
      select: { id: true, nome: true },
    });
    return { encontrados: linhas };
  }

  /**
   * Tira a conversa do bot e entrega a uma pessoa.
   *
   * `atendenteVendedorId` nulo é a fila de quem não tem dono: administrativo,
   * ou cliente que não soube dizer com quem fala. Ela aparece para quem tem
   * alcance de equipe, não para todo vendedor — o recorte está em
   * `escopoLeituraWhatsapp`.
   */
  private async direcionar(
    tx: TenantTx,
    empresaId: string,
    conversaId: string,
    destino: {
      vendedorId: string | null;
      assunto: string;
      administrativo: boolean;
    },
  ) {
    // Vendedor informado pelo modelo é conferido: id inventado (ou de outra
    // empresa) vira fila sem dono, não uma conversa entregue a ninguém.
    let vendedorId: string | null = null;
    if (destino.vendedorId && !destino.administrativo) {
      const existe = await tx.vendedor.findFirst({
        where: {
          id: destino.vendedorId,
          empresaId,
          deletedAt: null,
          ativo: true,
        },
        select: { id: true },
      });
      vendedorId = existe?.id ?? null;
    }

    await tx.whatsappConversa.update({
      where: { id: conversaId },
      data: {
        atendimento: 'aguardando',
        atendenteVendedorId: vendedorId,
        assunto: destino.assunto.slice(0, 200),
        direcionadaEm: new Date(),
      },
    });

    await this.avisarAguardando(tx, empresaId, conversaId, {
      vendedorId,
      assunto: destino.assunto,
    });

    return {
      direcionado: true,
      para: destino.administrativo
        ? 'administrativo'
        : vendedorId
          ? 'vendedor'
          : 'fila',
    };
  }

  /**
   * Avisa quem precisa saber que há cliente esperando.
   *
   * Dois casos, e o destinatário muda:
   *
   * - **Direcionada a alguém**: avisa essa pessoa, e mais ninguém. É a caixa
   *   dela, e o supervisor não precisa de um sino por atendimento de cada
   *   vendedor do time.
   * - **Fila sem dono**: avisa quem está trabalhando agora — em expediente e
   *   com sessão aberta. Avisar quem não está no sistema é encher a caixa de
   *   quem não vai ver, e some com o sinal de quem vê.
   *
   * Supervisor e gerente entram na lista da fila sem dono porque também
   * atendem e porque a fila parada é problema deles. Já a conversa com dono
   * não os notifica: eles a enxergam na tela, que é onde acompanhar faz
   * sentido.
   */
  private async avisarAguardando(
    tx: TenantTx,
    empresaId: string,
    conversaId: string,
    destino: { vendedorId: string | null; assunto: string },
  ) {
    const alvos: string[] = [];

    if (destino.vendedorId) {
      const usuarioId = await usuarioDoVendedor(tx, empresaId, destino.vendedorId);
      if (usuarioId) alvos.push(usuarioId);
    } else {
      const presentes = await this.vendedoresPresentes(tx, empresaId);
      const usuarios = await Promise.all(
        presentes.map((p) => usuarioDoVendedor(tx, empresaId, p.vendedorId)),
      );
      alvos.push(...usuarios.filter((u): u is string => u !== null));
    }

    for (const usuarioId of alvos) {
      await registrarNotificacao(tx, {
        empresaId,
        usuarioId,
        tipo: 'whatsapp_aguardando',
        titulo: destino.assunto.slice(0, 120),
        rota: `/comercial/atendimento?conversa=${conversaId}`,
        referenciaId: conversaId,
        // Não acumula: cada direcionamento é um cliente esperando, e agrupar
        // faria "3 mensagens" no lugar de três pessoas na fila.
        acumular: false,
      });
    }
  }

  /**
   * Pareamento do número de um funcionário reconhecido mas não confirmado.
   *
   * A conversa **não vai para a fila** enquanto isso: ela fica em `bot`, que é
   * onde deve estar — não há cliente esperando, há um colega confirmando o
   * telefone dele. Mandar isso para a fila faria alguém abrir a conversa para
   * descobrir que era um pareamento em andamento.
   */
  private async parear(
    empresaId: string,
    conversaId: string,
    identidade: { vinculoId: string; nome: string },
    texto: string | null,
  ) {
    const confirmacao = await this.funcionarios.tentarConfirmar(
      empresaId,
      identidade.vinculoId,
      texto,
    );
    if (confirmacao) {
      await this.responder(empresaId, conversaId, confirmacao.mensagem);
      return;
    }

    const pedido = await this.funcionarios.pedirCodigo(
      empresaId,
      identidade.vinculoId,
      identidade.nome,
    );
    await this.responder(empresaId, conversaId, pedido);
  }

  /**
   * Atende o funcionário com número já confirmado.
   *
   * O escopo sai de `resolverEscopoDoUsuario` — **a mesma função do sistema**,
   * chamada com o usuarioId em vez de uma sessão. É o que garante que o
   * WhatsApp não tenha uma segunda definição de "o que eu posso ver", e o que
   * evita fabricar um `AuthenticatedUser` sintético para atravessar serviços
   * que assumem uma pessoa logada.
   */
  private async atenderFuncionario(
    empresaId: string,
    conversaId: string,
    contexto: { nomeEmpresa: string; historico: MensagemChat[] },
    identidade: { usuarioId: string; nome: string; superior: boolean },
  ) {
    let cfg;
    try {
      cfg = await this.agenteConfig.paraUso(empresaId);
    } catch {
      await this.responder(
        empresaId,
        conversaId,
        'O assistente não está configurado nesta empresa. Fale com quem administra o sistema.',
      );
      return;
    }

    const escopo = await this.prisma.withTenant(empresaId, (tx) =>
      resolverEscopoDoUsuario(tx, empresaId, {
        usuarioId: identidade.usuarioId,
        // Pelo WhatsApp ninguém é admin de plataforma: o corte é sempre o do
        // cadastro de vendedor. Admin que quiser ver a empresa inteira usa o
        // sistema, onde entrou com senha.
        isAdmin: false,
      }),
    );

    const mensagens: MensagemChat[] = [
      {
        papel: 'system',
        conteudo: montarPromptFuncionario({
          nomeEmpresa: contexto.nomeEmpresa,
          nome: identidade.nome.trim().split(/\s+/)[0],
          superior: identidade.superior,
        }),
      },
      ...contexto.historico,
    ];

    let resposta: string | null = null;

    for (let volta = 0; volta < MAX_VOLTAS; volta++) {
      const r = await this.provedores.para(cfg.provedor).conversar({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        contaId: cfg.contaId,
        modelo: cfg.modelo,
        temperatura: cfg.temperatura,
        maxTokens: cfg.maxTokens,
        mensagens,
        ferramentas: FERRAMENTAS_DO_FUNCIONARIO,
      });

      if (r.chamadas.length === 0) {
        resposta = r.texto;
        break;
      }

      mensagens.push({
        papel: 'assistant',
        conteudo: r.texto,
        chamadas: r.chamadas,
        bruto: r.bruto,
      });

      for (const chamada of r.chamadas) {
        const resultado = await this.prisma.withTenant(empresaId, (tx) =>
          this.executarFerramentaFuncionario(
            tx,
            empresaId,
            escopo,
            chamada.nome,
            chamada.argumentos,
          ),
        );
        mensagens.push({
          papel: 'tool',
          chamadaId: chamada.id,
          conteudo: JSON.stringify(resultado),
        });
      }
    }

    if (resposta?.trim()) {
      await this.responder(empresaId, conversaId, resposta.trim());
    }
  }

  private async executarFerramentaFuncionario(
    tx: TenantTx,
    empresaId: string,
    escopo: EscopoVendedores,
    nome: string,
    argumentos: Record<string, unknown>,
  ): Promise<unknown> {
    switch (nome) {
      case 'meus_titulos_vencidos':
        return this.funcionarioTools.titulosVencidos(
          tx,
          empresaId,
          escopo,
          Number(argumentos.quantidade) || 10,
        );

      case 'minha_agenda':
        return this.funcionarioTools.agenda(
          tx,
          empresaId,
          escopo,
          Number(argumentos.dias ?? 7),
        );

      case 'situacao_do_cliente':
        return this.funcionarioTools.situacaoDoCliente(
          tx,
          empresaId,
          escopo,
          String(argumentos.nome ?? ''),
        );

      case 'clientes_aguardando':
        return this.funcionarioTools.clientesAguardando(tx, empresaId, escopo);

      case 'acompanhar_objetivos':
        return this.funcionarioTools.objetivos(tx, empresaId, escopo, {
          vendedor:
            typeof argumentos.vendedor === 'string'
              ? argumentos.vendedor
              : undefined,
          mes: Number(argumentos.mes) || undefined,
          ano: Number(argumentos.ano) || undefined,
        });

      case 'resumo_de_atividades':
        return this.funcionarioTools.resumoAtividades(
          tx,
          empresaId,
          escopo,
          Number(argumentos.dias) || 30,
        );

      case 'aniversariantes':
        return this.funcionarioTools.aniversariantes(tx, empresaId, escopo, {
          de: argumentos.de === 'equipe' ? 'equipe' : 'clientes',
          dias: Number(argumentos.dias) || 7,
        });

      case 'clientes_sem_compra_no_mes':
        return this.funcionarioTools.clientesSemCompraNoMes(
          tx,
          empresaId,
          escopo,
          Number(argumentos.quantidade) || 10,
        );

      default:
        return { erro: `Ferramenta desconhecida: ${nome}` };
    }
  }

  /**
   * A saudação da empresa, uma vez por rodada de triagem.
   *
   * O marcador é gravado **antes** do envio, e não depois: falha de transporte
   * repetiria a saudação a cada mensagem seguinte, e o cliente receberia "Olá!
   * Como posso ajudar?" três vezes seguidas. Perder uma saudação é menos ruim
   * do que repeti-la.
   */
  private async saudar(empresaId: string, conversaId: string, texto: string) {
    try {
      await this.prisma.withTenant(empresaId, (tx) =>
        tx.whatsappConversa.update({
          where: { id: conversaId },
          data: { saudadoEm: new Date() },
        }),
      );
      await this.responder(empresaId, conversaId, texto);
    } catch (erro) {
      // Saudação não é o atendimento: se ela falhar, a triagem continua.
      this.logger.warn(
        `Falha ao enviar saudação da conversa ${conversaId}: ${erro}`,
      );
    }
  }

  /**
   * Manda a resposta do bot pelo WhatsApp.
   *
   * Não passa por `WhatsappConversasService.enviar`: aquele exige um
   * `AuthenticatedUser` e confere o dono da sessão — as duas coisas que o bot
   * não tem e não é. Aqui o caminho é o transporte direto, e a autoria fica
   * registrada como do próprio atendimento automático.
   */
  private async responder(empresaId: string, conversaId: string, texto: string) {
    await this.prisma.withTenant(empresaId, async (tx) => {
      const conversa = await tx.whatsappConversa.findFirst({
        where: { id: conversaId },
        select: {
          sessaoId: true,
          contato: { select: { jid: true } },
        },
      });
      if (!conversa) return;

      const enviada = await this.provider.enviarTexto(
        empresaId,
        conversa.sessaoId,
        { jid: conversa.contato.jid, texto },
        tx,
      );

      await tx.whatsappMensagem.create({
        data: {
          empresaId,
          conversaId,
          externoId: enviada.externoId,
          direcao: 'saida',
          tipo: 'texto',
          conteudo: texto,
          // Autoria explícita: quem lê o histórico precisa distinguir o que a
          // IA respondeu do que a pessoa escreveu, e "sem autor" seria lido
          // como mensagem do sistema.
          enviadaPor: AUTOR_TRIAGEM,
          statusEntrega: 'enviada',
        },
      });

      await tx.whatsappConversa.update({
        where: { id: conversaId },
        data: { ultimaMensagemEm: new Date() },
      });
    });
  }
}
