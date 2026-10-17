import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { carregarCalendarioUtil } from '../../../common/horario/calendario-util';
import {
  ajustarAoExpediente,
  carregarExpedienteUsuario,
  diaLocal,
} from '../../../common/horario/expediente';
import { momentoLocal } from '../../../common/horario/horario-trabalho';
import { whereEmpresaAcessivel } from '../../../common/empresa/situacao-empresa';
import { registrarAtendimentoWhatsapp } from '../../../common/atividades/registrar-atendimento-whatsapp';
import { registrarNotificacao } from '../../notificacoes/registrar-notificacao';
import { WhatsappProviderService } from '../providers/whatsapp-provider.service';
import { assinaturaDoUsuario, mensagemComAutor } from '../mensagem-com-autor';
import { WhatsappRoteiroService } from './whatsapp-roteiro.service';
import { atrasoDeDigitacaoMs, saudacaoDoHorario } from './roteiro-saudacao';

/** De quanto em quanto tempo a rotina olha o roteiro. */
const INTERVALO_MS = 60_000;
/** Quanto antes do primeiro atendimento do dia o vendedor é chamado para confirmar. */
const ANTECEDENCIA_CONFIRMACAO_MS = 30 * 60_000;
/** Depois deste tempo sem atendimento, a supervisão é avisada. */
const TOLERANCIA_ATRASO_MS = 30 * 60_000;
/** Item não confirmado há mais que isto precisa ser remarcado, não confirmado. */
const LIMITE_PARA_CONFIRMAR_MS = 2 * 60 * 60_000;
/** Quantos atendimentos a rotina inicia por passada, por empresa. */
const LOTE_DE_INICIO = 20;

const dormir = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A execução do roteiro (docs/planos/2026-10-16-agendamentos-whatsapp.md, §7):
 *
 * 1. **Chama o vendedor para confirmar** o dia, antes do primeiro atendimento.
 *    Sem confirmação, **nada é enviado**.
 * 2. **Na hora de cada atendimento confirmado**, abre a conversa: mostra
 *    "digitando…", espera um pouco, manda a saudação pelo WhatsApp do vendedor,
 *    grava a nota (texto da geração) e avisa o vendedor.
 * 3. **Avisa a supervisão** quando o horário passa sem o atendimento ser feito.
 *
 * Como as demais rotinas de agendamento, só **uma réplica** age por item: a troca
 * de estado é uma atualização condicional.
 */
@Injectable()
export class WhatsappRoteiroExecucaoService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WhatsappRoteiroExecucaoService.name);
  private timer: NodeJS.Timeout | null = null;
  private emExecucao = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly provedores: WhatsappProviderService,
    private readonly roteiros: WhatsappRoteiroService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.processar(), INTERVALO_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Uma passada em todas as empresas (a rotina não se sobrepõe a si mesma). */
  async processar() {
    if (this.emExecucao) return;
    this.emExecucao = true;
    try {
      const empresas = await this.prisma.empresa.findMany({
        where: { deletedAt: null, ...whereEmpresaAcessivel() },
        select: { id: true },
      });
      for (const { id } of empresas) {
        await this.processarEmpresa(id).catch((erro) =>
          this.logger.error(`Roteiro da empresa ${id} falhou: ${erro}`),
        );
      }
    } finally {
      this.emExecucao = false;
    }
  }

  async processarEmpresa(empresaId: string) {
    await this.chamarParaConfirmar(empresaId);
    await this.iniciarVencidos(empresaId);
    await this.avisarAtrasos(empresaId);
  }

  // ------------------------------------------------------------------
  // 1. Confirmação do dia
  // ------------------------------------------------------------------

  /**
   * Um aviso por vendedor e por dia, perto do primeiro atendimento ainda sem
   * confirmação. A conferência de "já avisei" é na própria tabela de
   * notificações, em qualquer estado: ler o aviso não faz ele voltar.
   */
  async chamarParaConfirmar(empresaId: string, agora = new Date()) {
    await this.prisma.withTenant(empresaId, async (tx) => {
      const itens = await tx.whatsappRoteiroItem.findMany({
        where: {
          empresaId,
          status: 'agendado',
          quando: {
            lte: new Date(agora.getTime() + ANTECEDENCIA_CONFIRMACAO_MS),
            gt: new Date(agora.getTime() - LIMITE_PARA_CONFIRMAR_MS),
          },
        },
        select: { quando: true, roteiro: { select: { usuarioId: true } } },
        orderBy: { quando: 'asc' },
        take: 500,
      });
      if (itens.length === 0) return;

      const grupos = new Map<
        string,
        { usuarioId: string; dia: string; quantos: number; primeiro: Date }
      >();
      for (const i of itens) {
        const dia = diaLocal(i.quando);
        const chave = `${i.roteiro.usuarioId}:${dia}`;
        const g = grupos.get(chave);
        if (g) g.quantos += 1;
        else
          grupos.set(chave, {
            usuarioId: i.roteiro.usuarioId,
            dia,
            quantos: 1,
            primeiro: i.quando,
          });
      }

      const jaAvisados = new Set(
        (
          await tx.notificacao.findMany({
            where: {
              empresaId,
              tipo: 'roteiro_confirmar',
              referenciaId: { in: [...grupos.keys()] },
            },
            select: { referenciaId: true },
          })
        ).map((n) => n.referenciaId),
      );

      for (const [chave, g] of grupos) {
        if (jaAvisados.has(chave)) continue;
        await registrarNotificacao(tx, {
          empresaId,
          usuarioId: g.usuarioId,
          tipo: 'roteiro_confirmar',
          titulo: 'Confirme os atendimentos de hoje',
          descricao: `${g.quantos} ${g.quantos === 1 ? 'atendimento' : 'atendimentos'} do roteiro, a partir das ${momentoLocal(g.primeiro).hora}. Sem a sua confirmação, nada é enviado.`,
          rota: `/crm/agenda?roteiro=confirmar&dia=${g.dia}`,
          referenciaId: chave,
          ocorridaEm: g.primeiro,
        });
      }
    });
  }

  // ------------------------------------------------------------------
  // 2. Início dos atendimentos confirmados
  // ------------------------------------------------------------------

  async iniciarVencidos(empresaId: string, agora = new Date()) {
    const vencidos = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappRoteiroItem.findMany({
        where: { empresaId, status: 'confirmado', quando: { lte: agora } },
        select: { id: true, roteiro: { select: { usuarioId: true } } },
        orderBy: { quando: 'asc' },
        take: LOTE_DE_INICIO,
      }),
    );
    for (const item of vencidos) {
      // Só dentro do expediente de quem atende: se a rotina ficou parada e voltou
      // à noite, o atendimento espera (e o atraso chega à supervisão).
      if (
        !(await this.dentroDoExpediente(
          empresaId,
          item.roteiro.usuarioId,
          agora,
        ))
      ) {
        continue;
      }
      await this.iniciarItem(empresaId, item.id);
    }
  }

  private async dentroDoExpediente(
    empresaId: string,
    usuarioId: string,
    agora: Date,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const calendario = await carregarCalendarioUtil(tx, empresaId);
      const expediente = await carregarExpedienteUsuario(tx, usuarioId);
      return (
        ajustarAoExpediente(agora, calendario, expediente).getTime() ===
        agora.getTime()
      );
    });
  }

  /**
   * Abre o atendimento: saudação, nota e aviso. Qualquer falha vira `erro`
   * visível, com o motivo — atendimento que some em silêncio é pior do que um
   * que não começou.
   */
  async iniciarItem(empresaId: string, itemId: string) {
    // A trava: quem conseguir passar de `confirmado` para `iniciado` é quem age.
    const reservado = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappRoteiroItem.updateMany({
        where: { id: itemId, status: 'confirmado' },
        data: { status: 'iniciado', iniciadoEm: new Date() },
      }),
    );
    if (reservado.count === 0) return;

    try {
      const dados = await this.prisma.withTenant(empresaId, async (tx) => {
        const item = await tx.whatsappRoteiroItem.findFirstOrThrow({
          where: { id: itemId },
          include: { roteiro: true },
        });
        if (!item.conversaId) {
          throw new Error(
            'A conversa deste cliente não foi criada na confirmação.',
          );
        }
        const conversa = await tx.whatsappConversa.findFirstOrThrow({
          where: { id: item.conversaId },
          include: {
            contato: { select: { jid: true } },
            sessao: { select: { id: true, status: true, usuarioId: true } },
          },
        });
        const autor = await tx.usuario.findFirst({
          where: { id: item.roteiro.usuarioId },
          select: { nome: true, nomeWhatsapp: true, usarNomeWhatsapp: true },
        });
        const cliente = await tx.cliente.findFirst({
          where: { id: item.clienteId },
          select: { razaoSocial: true, nomeFantasia: true },
        });
        return { item, conversa, autor, cliente };
      });
      const { item, conversa, autor } = dados;
      const clienteNome =
        dados.cliente?.nomeFantasia ||
        dados.cliente?.razaoSocial ||
        'o cliente';

      if (conversa.sessao.status !== 'conectada') {
        throw new Error('O WhatsApp do vendedor não estava conectado na hora.');
      }
      // A instância precisa continuar sendo a de quem montou o roteiro.
      if (conversa.sessao.usuarioId !== item.roteiro.usuarioId) {
        throw new Error(
          'A instância do WhatsApp passou a ser de outro usuário.',
        );
      }

      // Comportamento humano: "digitando…", uma pausa curta e variável, e só
      // então a saudação.
      await this.provedores
        .presenca(empresaId, conversa.sessao.id, {
          jid: conversa.contato.jid,
          estado: 'digitando',
        })
        .catch(() => undefined);
      await dormir(atrasoDeDigitacaoMs());

      const texto = saudacaoDoHorario(new Date());
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
            enviadaPor: item.roteiro.usuarioId,
            statusEntrega: 'enviada',
          },
        });
        await tx.whatsappConversa.update({
          where: { id: conversa.id },
          data: { ultimaMensagemEm: mensagem.criadaEm },
        });
        // A nota nasce da geração: o texto que o vendedor escreveu ao montar o
        // roteiro. Fica só na plataforma (vendedor, supervisor e gerente).
        await tx.whatsappAcaoRegistro.create({
          data: {
            empresaId,
            conversaId: conversa.id,
            acao: 'anotacao',
            detalhe: { texto: item.roteiro.textoNota, roteiro: true },
            executadaPor: item.roteiro.usuarioId,
          },
        });
        await registrarAtendimentoWhatsapp(tx, {
          empresaId,
          autor: item.roteiro.usuarioId,
          clienteId: item.clienteId,
          vendedorId: item.roteiro.vendedorId,
          quando: mensagem.criadaEm,
        });
        await tx.whatsappRoteiroItem.update({
          where: { id: itemId },
          data: { erro: null },
        });
        await registrarNotificacao(tx, {
          empresaId,
          usuarioId: item.roteiro.usuarioId,
          tipo: 'roteiro_iniciado',
          titulo: `Atendimento iniciado: ${clienteNome}`,
          descricao:
            'A saudação foi enviada. A conversa é sua — continue pelo WhatsApp.',
          rota: `/comercial/atendimento?conversa=${conversa.id}`,
          referenciaId: itemId,
        });
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      this.logger.error(`Item do roteiro ${itemId} não iniciou: ${motivo}`);
      await this.prisma.withTenant(empresaId, async (tx) => {
        const item = await tx.whatsappRoteiroItem.update({
          where: { id: itemId },
          data: { status: 'erro', erro: motivo.slice(0, 500) },
          select: { roteiro: { select: { usuarioId: true } }, clienteId: true },
        });
        await registrarNotificacao(tx, {
          empresaId,
          usuarioId: item.roteiro.usuarioId,
          tipo: 'whatsapp_agendamento_erro',
          titulo: 'Atendimento do roteiro não começou',
          descricao: motivo.slice(0, 200),
          rota: '/crm/agenda',
          referenciaId: `roteiro-erro:${itemId}`,
        });
      });
    }
  }

  // ------------------------------------------------------------------
  // 3. Atraso
  // ------------------------------------------------------------------

  /** O horário passou e o atendimento não foi feito: avisa vendedor, supervisor e gerente — uma vez. */
  async avisarAtrasos(empresaId: string, agora = new Date()) {
    await this.prisma.withTenant(empresaId, async (tx) => {
      const atrasados = await tx.whatsappRoteiroItem.findMany({
        where: {
          empresaId,
          status: { in: ['agendado', 'confirmado'] },
          quando: { lt: new Date(agora.getTime() - TOLERANCIA_ATRASO_MS) },
          avisoAtrasoEm: null,
        },
        select: {
          id: true,
          clienteId: true,
          quando: true,
          roteiro: { select: { vendedorId: true } },
        },
        orderBy: { quando: 'asc' },
        take: 100,
      });
      for (const item of atrasados) {
        const vendedor = await tx.vendedor.findUnique({
          where: { id: item.roteiro.vendedorId },
          select: { nome: true },
        });
        const cliente = await tx.cliente.findFirst({
          where: { id: item.clienteId },
          select: { razaoSocial: true, nomeFantasia: true },
        });
        for (const usuarioId of await this.roteiros.usuariosDaSupervisao(
          tx,
          item.roteiro.vendedorId,
        )) {
          await registrarNotificacao(tx, {
            empresaId,
            usuarioId,
            tipo: 'roteiro_atraso',
            titulo: `${vendedor?.nome ?? 'Vendedor'}: atendimento passou do horário`,
            descricao: `${cliente?.nomeFantasia || cliente?.razaoSocial || 'Cliente'} — marcado para ${momentoLocal(item.quando).hora}, ainda sem atendimento.`,
            rota: '/crm/agenda',
            referenciaId: `roteiro-atraso:${item.id}`,
            ocorridaEm: item.quando,
          });
        }
        await tx.whatsappRoteiroItem.update({
          where: { id: item.id },
          data: { avisoAtrasoEm: agora },
        });
      }
    });
  }
}
