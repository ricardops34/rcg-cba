import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappProviderService } from './providers/whatsapp-provider.service';
import { mensagemComAutor } from './mensagem-com-autor';
import { WhatsappConversasService } from './whatsapp-conversas.service';
import {
  registrarNotificacao,
  usuarioDoVendedor,
} from '../notificacoes/registrar-notificacao';
import type { WhatsappAgendarMensagem } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/** De quanto em quanto tempo a rotina procura mensagem vencida. */
const INTERVALO_MS = 60_000;

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

      return tx.whatsappMensagemAgendada.create({
        data: {
          empresaId,
          conversaId: conversa.id,
          texto: input.texto,
          enviarEm: input.enviarEm,
          criadaPor: user.id,
        },
      });
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

      return linhas.map((l) => ({
        id: l.id,
        conversaId: l.conversaId,
        texto: l.texto,
        enviarEm: l.enviarEm,
        status: l.status,
        erro: l.erro,
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
      return { cancelada: true };
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
        where: { deletedAt: null, ativo: true },
        select: { id: true },
      });
      for (const empresa of empresas) {
        await this.processarEmpresa(empresa.id);
      }
    } catch (erro) {
      this.logger.error(`Falha na rotina de mensagens agendadas: ${erro}`);
    }
  }

  private async processarEmpresa(empresaId: string) {
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
    if (config.transporte === 'zapo' && !config.workerUrl) {
      this.logger.warn(
        `Empresa ${empresaId} tem mensagem agendada vencida, mas nenhum worker configurado.`,
      );
      return;
    }
    if (config.transporte === 'evolution_go' && !config.evolutionUrl) {
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
                sessao: { select: { id: true, status: true } },
              },
            },
          },
        });
        const autor = await tx.usuario.findFirst({
          where: { id: mensagem.criadaPor },
          select: { nome: true },
        });
        return { ...mensagem, autorNome: autor?.nome ?? 'Atendente' };
      });

      if (agendada.conversa.sessao.status !== 'conectada') {
        throw new Error(
          'O WhatsApp do vendedor não estava conectado na hora do envio.',
        );
      }

      const enviada = await this.provedores.enviarTexto(
        empresaId,
        agendada.conversa.sessaoId,
        {
          jid: agendada.conversa.contato.jid,
          texto: mensagemComAutor(agendada.autorNome, agendada.texto),
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
