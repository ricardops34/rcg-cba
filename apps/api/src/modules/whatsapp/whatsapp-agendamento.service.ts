import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { carregarCalendarioUtil } from '../../common/horario/calendario-util';
import {
  ajustarAoExpediente,
  carregarExpedienteUsuario,
} from '../../common/horario/expediente';
import { whereEmpresaAcessivel } from '../../common/empresa/situacao-empresa';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappProviderService } from './providers/whatsapp-provider.service';
import { assinaturaDoUsuario, mensagemComAutor } from './mensagem-com-autor';
import { registrarAtendimentoWhatsapp } from '../../common/atividades/registrar-atendimento-whatsapp';
import {
  atrasoDeDigitacaoMs,
  saudacaoDoModelo,
} from './roteiro/roteiro-saudacao';
import { WhatsappConversasService } from './whatsapp-conversas.service';
import {
  registrarNotificacao,
  usuarioDoVendedor,
} from '../notificacoes/registrar-notificacao';
import type {
  WhatsappAgendarMensagem,
  WhatsappAtualizarAgendamento,
  WhatsappAtualizarAtendimento,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/** Título da atividade da Agenda: o começo do texto, para reconhecer de relance. */
function tituloDaAtividade(texto: string) {
  const linha = texto.replace(/\s+/g, ' ').trim();
  return `Mensagem agendada: ${linha.length > 60 ? `${linha.slice(0, 57)}...` : linha}`;
}

/** De quanto em quanto tempo a rotina procura mensagem vencida. */
const INTERVALO_MS = 60_000;
const dormir = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
/** Sessão sem renovar de token por mais que isto: o usuário saiu sem fazer logout. */
const MINUTOS_SESSAO_VIVA = 40;

/**
 * Mensagens escritas para sair depois.
 *
 * O agendamento é autorizado **na criação** (escopo da conversa, dono da
 * sessão, permissão da rotina). Na hora do envio não há usuário logado, e
 * refazer essa verificação fora de uma requisição significaria reconstruir
 * permissões a partir do nada — por isso o envio confia no que já foi
 * conferido e apenas registra quem agendou.
 *
 * **Nada some sozinho:** falha de envio vira `erro` com a mensagem, visível na
 * conversa. Um agendamento que desaparece em silêncio é pior do que um que não
 * saiu, porque o vendedor acha que o cliente foi avisado.
 */
@Injectable()
export class WhatsappAgendamentoService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WhatsappAgendamentoService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsappConfigService,
    private readonly provedores: WhatsappProviderService,
    private readonly conversas: WhatsappConversasService,
  ) {}

  onModuleInit() {
    // `unref` para o timer não segurar o processo no encerramento — o
    // container precisa parar quando o deploy manda parar.
    this.timer = setInterval(() => void this.processarVencidas(), INTERVALO_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async agendar(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    input: WhatsappAgendarMensagem,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      // Mesma porta do envio imediato: conversa no escopo e só o dono da
      // sessão fala pelo aparelho. Agendar não pode ser um contorno disso.
      const conversa = await this.conversas.conversaParaEnvio(
        tx,
        empresaId,
        user,
        conversaId,
      );

      const calendario = await carregarCalendarioUtil(tx, empresaId);
      // Sai em dia útil e dentro do expediente de quem agenda: mensagem ao
      // cliente fora do horário é o que o vendedor não faria à mão.
      const enviarEm = ajustarAoExpediente(
        new Date(input.enviarEm),
        calendario,
        await carregarExpedienteUsuario(tx, user.id),
      );

      // O agendamento entra na Agenda do vendedor, ligado à conversa e ao
      // cliente — é o que o torna visível (e alterável) fora da tela de
      // WhatsApp. O vendedor é o dono do aparelho que vai enviar.
      const vendedorId = conversa.sessao.vendedorId;
      const atividade = vendedorId
        ? await tx.atividade.create({
            data: {
              empresaId,
              vendedorId,
              clienteId: conversa.clienteId ?? null,
              conversaId: conversa.id,
              tipo: 'tarefa',
              titulo: tituloDaAtividade(input.texto),
              descricao: input.texto,
              dataVencimento: enviarEm,
              automatica: true,
              importante: input.importante ?? false,
              createdBy: user.id,
              updatedBy: user.id,
            },
            select: { id: true },
          })
        : null;

      return tx.whatsappMensagemAgendada.create({
        data: {
          empresaId,
          conversaId: conversa.id,
          texto: input.texto,
          enviarEm,
          atividadeId: atividade?.id ?? null,
          criadaPor: user.id,
        },
      });
    });
  }

  /**
   * Altera texto e/ou data e hora de uma mensagem **ainda pendente**.
   *
   * O `updateMany` com o status no filtro é a mesma trava do cancelamento:
   * se a rotina já pegou a mensagem (`enviando`), alterar chegaria tarde e
   * mentiria para o vendedor. A atividade da Agenda acompanha a mudança.
   */
  async atualizar(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    agendamentoId: string,
    input: WhatsappAtualizarAgendamento,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.conversas.conversaParaEnvio(tx, empresaId, user, conversaId);

      const dados: { texto?: string; enviarEm?: Date } = {};
      if (input.texto !== undefined) dados.texto = input.texto;
      if (input.enviarEm !== undefined) {
        const calendario = await carregarCalendarioUtil(tx, empresaId);
        dados.enviarEm = ajustarAoExpediente(
          new Date(input.enviarEm),
          calendario,
          await carregarExpedienteUsuario(tx, user.id),
        );
      }

      // Só a marca de importante não toca a mensagem: vale para a atividade.
      const mudaMensagem = Object.keys(dados).length > 0;
      const { count } = mudaMensagem
        ? await tx.whatsappMensagemAgendada.updateMany({
            where: { id: agendamentoId, conversaId, status: 'pendente' },
            data: dados,
          })
        : await tx.whatsappMensagemAgendada.updateMany({
            where: { id: agendamentoId, conversaId, status: 'pendente' },
            data: {},
          });
      if (count === 0) {
        throw new NotFoundException(
          'Agendamento não encontrado, já enviado ou em envio.',
        );
      }

      const atual = await tx.whatsappMensagemAgendada.findFirstOrThrow({
        where: { id: agendamentoId },
      });
      if (atual.atividadeId) {
        await tx.atividade.updateMany({
          where: { id: atual.atividadeId, empresaId },
          data: {
            titulo: tituloDaAtividade(atual.texto),
            descricao: atual.texto,
            dataVencimento: atual.enviarEm,
            ...(input.importante !== undefined
              ? { importante: input.importante }
              : {}),
            updatedBy: user.id,
          },
        });
      }
      return atual;
    });
  }

  /** As agendadas da conversa — as pendentes primeiro, que são as que importam. */
  async listar(empresaId: string, user: AuthenticatedUser, conversaId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.conversas.conversaNoEscopoPublica(
        tx,
        empresaId,
        user,
        conversaId,
      );

      const linhas = await tx.whatsappMensagemAgendada.findMany({
        where: { conversaId, status: { in: ['pendente', 'erro'] } },
        orderBy: { enviarEm: 'asc' },
      });

      const autores = await tx.usuario.findMany({
        where: { id: { in: [...new Set(linhas.map((l) => l.criadaPor))] } },
        select: { id: true, nome: true },
      });
      const nomePorId = new Map(autores.map((a) => [a.id, a.nome]));
      const atividadeIds = linhas
        .map((l) => l.atividadeId)
        .filter((id): id is string => !!id);
      const importantes = new Set(
        atividadeIds.length
          ? (
              await tx.atividade.findMany({
                where: { id: { in: atividadeIds }, importante: true },
                select: { id: true },
              })
            ).map((a) => a.id)
          : [],
      );

      return linhas.map((l) => ({
        importante: l.atividadeId ? importantes.has(l.atividadeId) : false,
        id: l.id,
        conversaId: l.conversaId,
        texto: l.texto,
        enviarEm: l.enviarEm,
        status: l.status,
        erro: l.erro,
        atividadeId: l.atividadeId,
        criadaPor: l.criadaPor,
        criadaPorNome: nomePorId.get(l.criadaPor) ?? null,
        criadaEm: l.criadaEm,
      }));
    });
  }

  async cancelar(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    agendamentoId: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.conversas.conversaParaEnvio(tx, empresaId, user, conversaId);

      // `updateMany` com o status no filtro: cancelar o que a rotina já pegou
      // (`enviando`) chegaria tarde demais e mentiria para o vendedor.
      const { count } = await tx.whatsappMensagemAgendada.updateMany({
        where: { id: agendamentoId, conversaId, status: 'pendente' },
        data: { status: 'cancelada' },
      });
      if (count === 0) {
        throw new NotFoundException(
          'Agendamento não encontrado ou já em envio.',
        );
      }
      // Cancelado não é tarefa pendente: sai da agenda. O registro do
      // cancelamento fica no próprio agendamento (`status: cancelada`).
      const cancelada = await tx.whatsappMensagemAgendada.findFirst({
        where: { id: agendamentoId },
        select: { atividadeId: true },
      });
      if (cancelada?.atividadeId) {
        await tx.atividade.updateMany({
          where: { id: cancelada.atividadeId, empresaId, deletedAt: null },
          data: {
            ativo: false,
            deletedAt: new Date(),
            deletedBy: user.id,
            updatedBy: user.id,
          },
        });
      }
      return { cancelada: true };
    });
  }

  /** Atendimentos agendados da conversa que ainda estão em aberto. */
  async listarAtendimentos(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.conversas.conversaNoEscopoPublica(
        tx,
        empresaId,
        user,
        conversaId,
      );
      const linhas = await tx.atividade.findMany({
        where: {
          empresaId,
          conversaId,
          iniciarConversa: true,
          concluida: false,
          ativo: true,
          deletedAt: null,
        },
        orderBy: { dataVencimento: 'asc' },
        select: {
          id: true,
          conversaId: true,
          tipo: true,
          titulo: true,
          descricao: true,
          dataVencimento: true,
          importante: true,
          naoRealizada: true,
          motivoNaoRealizacao: true,
        },
      });
      return linhas;
    });
  }

  /**
   * Altera um atendimento agendado em aberto. Mudar a data e hora zera o aviso
   * já gravado: sem isso, quem reagenda depois de ter sido avisado nunca
   * receberia o aviso da nova hora (um aviso por atividade).
   */
  async atualizarAtendimento(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    atividadeId: string,
    input: WhatsappAtualizarAtendimento,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.conversas.conversaParaEnvio(tx, empresaId, user, conversaId);

      const dados: {
        titulo?: string;
        descricao?: string | null;
        dataVencimento?: Date;
        importante?: boolean;
        naoRealizada?: boolean;
        motivoNaoRealizacao?: string | null;
      } = {};
      if (input.importante !== undefined) dados.importante = input.importante;
      if (input.titulo !== undefined) dados.titulo = input.titulo;
      if (input.descricao !== undefined) dados.descricao = input.descricao;
      if (input.dataVencimento !== undefined) {
        const calendario = await carregarCalendarioUtil(tx, empresaId);
        dados.dataVencimento = ajustarAoExpediente(
          new Date(input.dataVencimento),
          calendario,
          await carregarExpedienteUsuario(tx, user.id),
        );
        // Reagendar dá uma nova chance ao atendimento que não aconteceu.
        dados.naoRealizada = false;
        dados.motivoNaoRealizacao = null;
      }

      const { count } = await tx.atividade.updateMany({
        where: {
          id: atividadeId,
          empresaId,
          conversaId,
          iniciarConversa: true,
          concluida: false,
          deletedAt: null,
        },
        data: { ...dados, updatedBy: user.id },
      });
      if (count === 0) {
        throw new NotFoundException(
          'Atendimento agendado não encontrado ou já concluído.',
        );
      }
      if (dados.dataVencimento) {
        await tx.notificacao.deleteMany({
          where: {
            empresaId,
            tipo: { in: ['atendimento_agendado', 'atendimento_nao_realizado'] },
            referenciaId: atividadeId,
          },
        });
      }
      return { atualizado: true };
    });
  }

  /** Cancela um atendimento agendado: sai da agenda e não avisa mais. */
  async cancelarAtendimento(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    atividadeId: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.conversas.conversaParaEnvio(tx, empresaId, user, conversaId);
      const { count } = await tx.atividade.updateMany({
        where: {
          id: atividadeId,
          empresaId,
          conversaId,
          iniciarConversa: true,
          concluida: false,
          deletedAt: null,
        },
        data: {
          ativo: false,
          deletedAt: new Date(),
          deletedBy: user.id,
          updatedBy: user.id,
        },
      });
      if (count === 0) {
        throw new NotFoundException(
          'Atendimento agendado não encontrado ou já concluído.',
        );
      }
      return { cancelado: true };
    });
  }

  /**
   * Varre as empresas em busca de agendamento vencido e envia.
   *
   * Percorre empresa por empresa porque **as tabelas têm RLS**: sem
   * `withTenant`, a consulta volta vazia. `empresas` não tem RLS, então é por
   * ela que a varredura começa.
   */
  private async processarVencidas() {
    try {
      const empresas = await this.prisma.empresa.findMany({
        where: { deletedAt: null, ...whereEmpresaAcessivel() },
        select: { id: true },
      });
      for (const empresa of empresas) {
        await this.processarEmpresa(empresa.id);
        // Isolado: uma falha ao avisar não pode parar a varredura das demais.
        await this.avisarAtendimentosAgendados(empresa.id).catch((erro) =>
          this.logger.error(
            `Falha ao avisar atendimentos agendados (${empresa.id}): ${erro}`,
          ),
        );
      }
    } catch (erro) {
      this.logger.error(`Falha na rotina de mensagens agendadas: ${erro}`);
    }
  }

  /**
   * Chegou a hora de um atendimento agendado. **Não envia nada ao cliente** —
   * quem decide o que dizer é o vendedor.
   *
   * - Quem agendou **está no sistema** (sessão aberta e ativa há pouco): avisa
   *   no sino, o sino abre a conversa na tela dele e o sistema manda ao
   *   cliente a saudação configurada ("Bom dia, tudo bem?").
   * - **Não está**: o atendimento fica marcado como não realizado, com o
   *   motivo, e o aviso espera no sino para quando ele entrar.
   *
   * O envio da saudação fica **fora** da transação (leva segundos, com o
   * "digitando…") e é reservado por `conversaIniciadaEm`, para que só uma
   * réplica da API o faça.
   *
   * Um desfecho por atividade, para sempre: o aviso é conferido na própria
   * tabela de notificações (qualquer estado) e o "não realizado" sai da
   * varredura, então reiniciar a API ou ler o aviso não repete nada.
   *
   * O responsável é quem agendou; sem ele, o vendedor que atende e, por
   * último, o dono da carteira. Não exigir usuário no vendedor da carteira: o
   * agendamento vale para quem o fez, e filtrar por ele deixava o atendimento
   * sem aviso algum.
   */
  private async avisarAtendimentosAgendados(empresaId: string) {
    const iniciar: { id: string; usuarioId: string }[] = [];
    await this.prisma.withTenant(empresaId, async (tx) => {
      const atividades = await tx.atividade.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ativo: true,
          concluida: false,
          naoRealizada: false,
          iniciarConversa: true,
          conversaId: { not: null },
          dataVencimento: { not: null, lte: new Date() },
        },
        select: {
          id: true,
          titulo: true,
          conversaId: true,
          dataVencimento: true,
          createdBy: true,
          vendedor: { select: { usuarioId: true } },
          vendedorAtendimento: { select: { usuarioId: true } },
          cliente: { select: { razaoSocial: true } },
        },
        orderBy: { dataVencimento: 'asc' },
        take: 50,
      });
      if (atividades.length === 0) return;

      const jaAvisadas = new Set(
        (
          await tx.notificacao.findMany({
            where: {
              empresaId,
              tipo: { in: ['atendimento_agendado', 'atendimento_nao_realizado'] },
              referenciaId: { in: atividades.map((a) => a.id) },
            },
            select: { referenciaId: true },
          })
        ).map((n) => n.referenciaId),
      );

      const responsavelDe = (a: (typeof atividades)[number]) =>
        a.createdBy ??
        a.vendedorAtendimento?.usuarioId ??
        a.vendedor.usuarioId ??
        null;
      const responsaveis = [
        ...new Set(atividades.map(responsavelDe).filter((u): u is string => !!u)),
      ];
      // `sessoes` não tem RLS (escrita no login, antes de haver empresa ativa):
      // o corte por empresa vem do `where`. A atividade da sessão avança a cada
      // renovação de token, daí a janela de tolerância.
      const presentes = new Set(
        (
          await tx.sessao.findMany({
            where: {
              usuarioId: { in: responsaveis },
              empresaId,
              encerradaEm: null,
              ultimaAtividadeEm: {
                gte: new Date(Date.now() - MINUTOS_SESSAO_VIVA * 60_000),
              },
            },
            select: { usuarioId: true },
          })
        ).map((s) => s.usuarioId),
      );

      for (const atividade of atividades) {
        if (jaAvisadas.has(atividade.id)) continue;
        const usuarioId = responsavelDe(atividade);
        const cliente = atividade.cliente?.razaoSocial;
        const ocorridaEm = atividade.dataVencimento ?? new Date();
        const rota = `/comercial/atendimento?conversa=${atividade.conversaId}`;

        if (usuarioId && presentes.has(usuarioId)) {
          await registrarNotificacao(tx, {
            empresaId,
            usuarioId,
            tipo: 'atendimento_agendado',
            titulo: cliente
              ? `Hora de atender ${cliente}`
              : 'Hora de um atendimento agendado',
            descricao: atividade.titulo,
            rota,
            referenciaId: atividade.id,
            ocorridaEm,
          });
          iniciar.push({ id: atividade.id, usuarioId });
          continue;
        }

        const motivo = usuarioId
          ? 'O responsável não estava no sistema na hora marcada.'
          : 'O agendamento não tem usuário responsável para ser avisado.';
        await tx.atividade.update({
          where: { id: atividade.id },
          data: { naoRealizada: true, motivoNaoRealizacao: motivo },
        });
        if (usuarioId) {
          await registrarNotificacao(tx, {
            empresaId,
            usuarioId,
            tipo: 'atendimento_nao_realizado',
            titulo: cliente
              ? `Atendimento não realizado: ${cliente}`
              : 'Atendimento agendado não realizado',
            descricao: `${atividade.titulo} — ${motivo}`,
            rota,
            referenciaId: atividade.id,
            ocorridaEm,
          });
        }
      }
    });

    for (const { id, usuarioId } of iniciar) {
      await this.iniciarConversaAgendada(empresaId, id, usuarioId);
    }
  }

  /**
   * Manda a saudação ao cliente, pelo WhatsApp de quem agendou, com o
   * "digitando…" e a pausa de sempre. Falha vira atendimento **não realizado**,
   * com o motivo — e o aviso no sino —, em vez de sumir em silêncio.
   */
  private async iniciarConversaAgendada(
    empresaId: string,
    atividadeId: string,
    usuarioId: string,
  ) {
    const reservada = await this.prisma.withTenant(empresaId, (tx) =>
      tx.atividade.updateMany({
        where: { id: atividadeId, conversaIniciadaEm: null, naoRealizada: false },
        data: { conversaIniciadaEm: new Date() },
      }),
    );
    if (reservada.count === 0) return;

    try {
      const config = await this.config.obter(empresaId);
      const dados = await this.prisma.withTenant(empresaId, async (tx) => {
        const atividade = await tx.atividade.findFirstOrThrow({
          where: { id: atividadeId },
          select: { conversaId: true, clienteId: true, vendedorId: true },
        });
        const conversa = await tx.whatsappConversa.findFirstOrThrow({
          where: { id: atividade.conversaId! },
          include: {
            contato: { select: { jid: true } },
            sessao: { select: { id: true, status: true, usuarioId: true } },
          },
        });
        const autor = await tx.usuario.findFirst({
          where: { id: usuarioId },
          select: { nome: true, nomeWhatsapp: true, usarNomeWhatsapp: true },
        });
        return { atividade, conversa, autor };
      });
      const { atividade, conversa, autor } = dados;

      if (!config.evolutionUrl) {
        throw new Error('A Evolution GO não está configurada.');
      }
      if (conversa.sessao.status !== 'conectada') {
        throw new Error('O WhatsApp do vendedor não estava conectado na hora.');
      }
      // Mesma regra das mensagens agendadas: o aparelho precisa continuar sendo
      // de quem agendou (empresa + usuário + vendedor).
      if (conversa.sessao.usuarioId !== usuarioId) {
        throw new Error('A instância do WhatsApp passou a ser de outro usuário.');
      }

      await this.provedores
        .presenca(empresaId, conversa.sessao.id, {
          jid: conversa.contato.jid,
          estado: 'digitando',
        })
        .catch(() => undefined);
      await dormir(atrasoDeDigitacaoMs());

      const texto = saudacaoDoModelo(
        config.saudacaoAtendimentoAgendado,
        new Date(),
      );
      const enviada = await this.provedores.enviarTexto(
        empresaId,
        conversa.sessao.id,
        {
          jid: conversa.contato.jid,
          texto: mensagemComAutor(assinaturaDoUsuario(autor), texto),
          respondeuA: null,
        },
      );

      await this.prisma.withTenant(empresaId, async (tx) => {
        const mensagem = await tx.whatsappMensagem.create({
          data: {
            empresaId,
            conversaId: conversa.id,
            externoId: enviada.externoId,
            direcao: 'saida',
            tipo: 'texto',
            conteudo: texto,
            enviadaPor: usuarioId,
            statusEntrega: 'enviada',
          },
        });
        await tx.whatsappConversa.update({
          where: { id: conversa.id },
          data: { ultimaMensagemEm: mensagem.criadaEm },
        });
        // O sistema fez a parte dele: a conversa está aberta e é do vendedor.
        await tx.atividade.update({
          where: { id: atividadeId },
          data: { concluida: true, dataConclusao: new Date() },
        });
        await registrarAtendimentoWhatsapp(tx, {
          empresaId,
          autor: usuarioId,
          clienteId: atividade.clienteId,
          vendedorId: atividade.vendedorId,
          quando: mensagem.criadaEm,
        });
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      this.logger.error(
        `Atendimento agendado ${atividadeId} não iniciou: ${motivo}`,
      );
      await this.prisma.withTenant(empresaId, async (tx) => {
        const atividade = await tx.atividade.update({
          where: { id: atividadeId },
          data: {
            naoRealizada: true,
            motivoNaoRealizacao: `Não consegui iniciar a conversa: ${motivo}`.slice(0, 500),
          },
          select: { titulo: true, conversaId: true, dataVencimento: true },
        });
        await registrarNotificacao(tx, {
          empresaId,
          usuarioId,
          tipo: 'atendimento_nao_realizado',
          titulo: 'Atendimento agendado não realizado',
          descricao: `${atividade.titulo} — ${motivo}`.slice(0, 300),
          rota: `/comercial/atendimento?conversa=${atividade.conversaId}`,
          referenciaId: atividadeId,
          ocorridaEm: atividade.dataVencimento ?? new Date(),
        });
      });
    }
  }

  private async processarEmpresa(empresaId: string) {
    const agora = new Date();
    const calendario = await this.prisma.withTenant(empresaId, (tx) => carregarCalendarioUtil(tx, empresaId));
    if (calendario.ajustar(agora).getTime() !== agora.getTime()) return;
    const vencidas = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappMensagemAgendada.findMany({
        where: { status: 'pendente', enviarEm: { lte: new Date() } },
        select: { id: true },
        take: 50,
      }),
    );
    if (vencidas.length === 0) return;

    // O aviso vale a consulta: mensagem agendada que vence sem provedor
    // configurado fica em `erro` uma a uma, e sem esta linha o log não diria
    // que a causa é a mesma para todas.
    const config = await this.config.obter(empresaId);
    if (!config.evolutionUrl) {
      this.logger.warn(
        `Empresa ${empresaId} tem mensagem agendada vencida, mas a Evolution GO não está configurada.`,
      );
      return;
    }
    for (const { id } of vencidas) {
      await this.enviarUma(empresaId, id);
    }
  }

  /**
   * Envia uma agendada, garantindo que só **uma** réplica da API a envie.
   *
   * A troca de `pendente` para `enviando` é a trava: quem conseguir mudar a
   * linha (a atualização condicional volta `count: 1`) é quem envia. A outra
   * réplica vê `count: 0` e segue adiante — sem isso, o cliente receberia a
   * mesma mensagem uma vez por réplica.
   */
  private async enviarUma(empresaId: string, id: string) {
    const reservada = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappMensagemAgendada.updateMany({
        where: { id, status: 'pendente' },
        data: { status: 'enviando' },
      }),
    );
    if (reservada.count === 0) return;

    try {
      const agendada = await this.prisma.withTenant(empresaId, async (tx) => {
        const mensagem = await tx.whatsappMensagemAgendada.findFirstOrThrow({
          where: { id },
          include: {
            conversa: {
              include: {
                contato: { select: { jid: true } },
                sessao: {
                  select: {
                    id: true,
                    status: true,
                    vendedorId: true,
                    usuarioId: true,
                  },
                },
              },
            },
          },
        });
        const autor = await tx.usuario.findFirst({
          where: { id: mensagem.criadaPor },
          select: { nome: true, nomeWhatsapp: true, usarNomeWhatsapp: true },
        });
        // Mesma assinatura do envio na hora: só assina quem ligou o nome no WhatsApp.
        return {
          ...mensagem,
          assinatura: assinaturaDoUsuario(autor),
          autorNome:
            (autor?.usarNomeWhatsapp && autor?.nomeWhatsapp?.trim()) ||
            autor?.nome ||
            'Atendente',
        };
      });

      if (agendada.conversa.sessao.status !== 'conectada') {
        throw new Error(
          'O WhatsApp do vendedor não estava conectado na hora do envio.',
        );
      }
      // Agendar foi autorizado para quem era dono da instância naquele
      // momento. Se outro usuário a conectou depois, a mensagem não sai pelo
      // aparelho dele (empresa + usuário + vendedor, 06/10/2026).
      if (agendada.conversa.sessao.usuarioId !== agendada.criadaPor) {
        throw new Error(
          'A instância passou a ser de outro usuário depois do agendamento.',
        );
      }

      const enviada = await this.provedores.enviarTexto(
        empresaId,
        agendada.conversa.sessaoId,
        {
          jid: agendada.conversa.contato.jid,
          texto: mensagemComAutor(agendada.assinatura, agendada.texto),
          respondeuA: null,
        },
      );

      await this.prisma.withTenant(empresaId, async (tx) => {
        const mensagem = await tx.whatsappMensagem.create({
          data: {
            empresaId,
            conversaId: agendada.conversaId,
            externoId: enviada.externoId,
            direcao: 'saida',
            tipo: 'texto',
            conteudo: agendada.texto,
            // Quem agendou é quem assina: no histórico, a mensagem é dele.
            enviadaPor: agendada.criadaPor,
            statusEntrega: 'enviada',
          },
        });
        await tx.whatsappConversa.update({
          where: { id: agendada.conversaId },
          data: { ultimaMensagemEm: mensagem.criadaEm },
        });
        await tx.whatsappMensagemAgendada.update({
          where: { id },
          data: { status: 'enviada', mensagemId: mensagem.id, erro: null },
        });
        // A agenda deixa de ter pendência: o envio aconteceu.
        if (agendada.atividadeId) {
          await tx.atividade.updateMany({
            where: { id: agendada.atividadeId, empresaId },
            data: { concluida: true, dataConclusao: new Date() },
          });
        }
        // A programada é atendimento como qualquer outra mensagem: entra no
        // histórico do cliente pelo mesmo registro diário. Este envio não passa
        // por `WhatsappConversasService.enviar` — ele grava a mensagem aqui,
        // para poder assinar com quem agendou — então o registro é explícito.
        await registrarAtendimentoWhatsapp(tx, {
          empresaId,
          autor: agendada.criadaPor,
          clienteId: agendada.conversa.clienteId,
          vendedorId: agendada.conversa.sessao.vendedorId,
          quando: mensagem.criadaEm,
        });
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      this.logger.error(`Agendamento ${id} falhou: ${motivo}`);
      // Volta para um estado visível na tela em vez de ficar preso em
      // `enviando`, que ninguém entenderia.
      await this.prisma.withTenant(empresaId, async (tx) => {
        const agendada = await tx.whatsappMensagemAgendada.update({
          where: { id },
          data: { status: 'erro', erro: motivo.slice(0, 500) },
          select: {
            conversaId: true,
            enviarEm: true,
            conversa: {
              select: {
                contato: {
                  select: {
                    jid: true,
                    nomeExibicao: true,
                    telefoneNormalizado: true,
                  },
                },
                sessao: { select: { vendedorId: true } },
              },
            },
          },
        });

        // O erro na conversa só é visto por quem a abre. Combinou-se um envio
        // com o cliente e ele não saiu: isso precisa alcançar o vendedor onde
        // ele estiver no sistema.
        const usuarioId = await usuarioDoVendedor(
          tx,
          empresaId,
          agendada.conversa.sessao.vendedorId,
        );
        if (!usuarioId) return;
        const nome =
          agendada.conversa.contato.nomeExibicao ??
          agendada.conversa.contato.telefoneNormalizado ??
          agendada.conversa.contato.jid.split('@')[0];
        await registrarNotificacao(tx, {
          empresaId,
          usuarioId,
          tipo: 'whatsapp_agendamento_erro',
          titulo: `Mensagem agendada não enviada — ${nome}`,
          descricao: motivo.slice(0, 300),
          rota: `/comercial/atendimento?conversa=${agendada.conversaId}`,
          referenciaId: id,
          ocorridaEm: agendada.enviarEm,
        });
      });
    }
  }
}
