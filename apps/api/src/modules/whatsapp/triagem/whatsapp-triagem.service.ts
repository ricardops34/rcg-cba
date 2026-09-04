import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TenantTx } from '../../../common/prisma/prisma.service';
import { AgenteConfigService } from '../../agente/agente-config.service';
import { ProvedorFactory } from '../../agente/provedor.factory';
import type { MensagemChat } from '../../agente/provedor-ia';
import { ferramentasDaTriagem } from './triagem-ferramentas';
import { montarPromptTriagem } from './triagem-prompt';
import { WhatsappProviderService } from '../providers/whatsapp-provider.service';

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
 * Triagem do número institucional.
 *
 * O que ela faz, em uma frase: recebe a mensagem que chegou no WhatsApp da
 * empresa, responde o que dá para responder, e entrega a conversa a uma pessoa.
 *
 * **O que ela não é:** o agente interno (`AgenteChatService`). Aquele conversa
 * com um funcionário logado e recorta ferramentas por perfil RBAC. Aqui do
 * outro lado está o **cliente**, e o recorte é o cliente associado ao número —
 * outro interlocutor, outro corte, outro prompt. Compartilham só a camada de
 * provedor de IA, que é onde de fato não há diferença.
 */
@Injectable()
export class WhatsappTriagemService {
  private readonly logger = new Logger(WhatsappTriagemService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agenteConfig: AgenteConfigService,
    private readonly provedores: ProvedorFactory,
    private readonly provider: WhatsappProviderService,
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
      await this.prisma
        .withTenant(entrada.empresaId, (tx) =>
          tx.whatsappConversa.update({
            where: { id: entrada.conversaId },
            data: {
              atendimento: 'aguardando',
              assunto: 'Triagem automática indisponível',
              direcionadaEm: new Date(),
            },
          }),
        )
        .catch(() => undefined);
    }
  }

  private async executar(entrada: {
    empresaId: string;
    conversaId: string;
    texto: string | null;
  }): Promise<void> {
    const { empresaId, conversaId } = entrada;

    const contexto = await this.carregarContexto(empresaId, conversaId);
    if (!contexto) return;

    const cfg = await this.agenteConfig.paraUso(empresaId);
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
          sessao: { select: { tipo: true } },
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
          select: { atendimentoInformacoes: true },
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
