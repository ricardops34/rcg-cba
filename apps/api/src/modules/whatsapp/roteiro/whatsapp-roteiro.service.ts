import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  RoteiroCancelar,
  RoteiroGravar,
  RoteiroItem,
  RoteiroItensQuery,
  RoteiroMotivo,
  RoteiroParametros,
  RoteiroPrevia,
  RoteiroRemarcar,
} from '@plataforma/contracts';
import { registrarNotificacao } from '../../notificacoes/registrar-notificacao';
import {
  PrismaService,
  type TenantTx,
} from '../../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { carregarCalendarioUtil } from '../../../common/horario/calendario-util';
import {
  ajustarAoExpediente,
  carregarExpedienteUsuario,
  diaLocal,
  instanteLocal,
  type ExpedienteUsuario,
} from '../../../common/horario/expediente';
import type { CalendarioUtil } from '../../../common/horario/calendario-util';
import {
  diasDoPeriodo,
  distribuir,
  gerarHorariosLivres,
  mesmoDiaMesAnterior,
  ocupadosDaAgenda,
  selecionarCandidatos,
  type ClienteMetricas,
  type Ocupado,
} from './roteiro-semanal';

const PADRAO_INICIO = '08:00';
const PADRAO_FIM = '18:00';

/** Data civil (AAAA-MM-DD) como o banco guarda as colunas `@db.Date`. */
const civil = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

const soDigitos = (v: string | null | undefined) =>
  (v ?? '').replace(/\D/g, '');
/** Telefone que dá para tentar no WhatsApp: DDD + número. */
const temTelefone = (...telefones: (string | null | undefined)[]) =>
  telefones.some((t) => soDigitos(t).length >= 10);

/**
 * Roteiro semanal de atendimentos por WhatsApp
 * (docs/planos/2026-10-16-agendamentos-whatsapp.md, §7).
 *
 * Esta parte é a **prévia**: nada é gravado. Ela escolhe os clientes da
 * carteira do próprio vendedor pelos critérios, acha os horários livres da
 * agenda dele (dia útil, dentro do expediente) e propõe um cliente por horário,
 * para o vendedor revisar.
 */
@Injectable()
export class WhatsappRoteiroService {
  constructor(private readonly prisma: PrismaService) {}

  async previa(
    empresaId: string,
    user: AuthenticatedUser,
    params: RoteiroParametros,
  ): Promise<RoteiroPrevia> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await tx.vendedor.findFirst({
        where: { usuarioId: user.id, empresaId, deletedAt: null },
        select: { id: true },
      });
      if (!vendedor) {
        throw new BadRequestException(
          'Seu usuário não está vinculado a um cadastro de vendedor.',
        );
      }

      // Cada critério lê um dado que tem a sua permissão: o roteiro não pode
      // ser um jeito de ver o que a tela dele não mostraria.
      const pode = (permissao: string) =>
        user.isAdmin || user.permissoes.includes(permissao);
      const { criterios } = params;
      const usaCompras =
        !!criterios.semCompraDias ||
        criterios.naoCompraramNoMes ||
        criterios.mesmoPeriodoMesPassado;
      if (usaCompras && !pode('notas-saida.visualizar')) {
        throw new BadRequestException(
          'Seu perfil não consulta vendas (notas de saída), então esses critérios não estão disponíveis.',
        );
      }
      if (criterios.tituloVencido && !pode('titulos-receber.visualizar')) {
        throw new BadRequestException(
          'Seu perfil não consulta títulos a receber, então o critério de título vencido não está disponível.',
        );
      }

      const hojeKey = diaLocal(new Date());
      if (params.dataFim < hojeKey) {
        throw new BadRequestException(
          'O período já terminou. Escolha datas a partir de hoje.',
        );
      }

      // ---------------- clientes da carteira ----------------
      const clientes = await tx.cliente.findMany({
        where: {
          empresaId,
          vendedorId: vendedor.id,
          ativo: true,
          deletedAt: null,
        },
        select: {
          id: true,
          razaoSocial: true,
          nomeFantasia: true,
          telefone: true,
          telefone2: true,
          celular: true,
        },
      });
      const ids = clientes.map((c) => c.id);
      if (ids.length === 0) {
        return this.vazia('cadastro');
      }

      const clientesQuePassaram = async (de: string, ate: string) =>
        new Set(
          (
            await tx.notaSaida.groupBy({
              by: ['clienteId'],
              where: {
                clienteId: { in: ids },
                deletedAt: null,
                ativo: true,
                // Comodato não é venda (mesma regra da lista de conversas).
                comodato: false,
                dtEmissao: { gte: civil(de), lte: civil(ate) },
              },
            })
          )
            .map((l) => l.clienteId)
            .filter((id): id is string => !!id),
        );

      const ultimaCompra = new Map<string, Date | null>();
      let comprouMesPassado = new Set<string>();
      let comprouNoMes = new Set<string>();
      let comprouMesmoPeriodo = new Set<string>();

      if (usaCompras) {
        for (const l of await tx.notaSaida.groupBy({
          by: ['clienteId'],
          where: {
            clienteId: { in: ids },
            deletedAt: null,
            ativo: true,
            comodato: false,
          },
          _max: { dtEmissao: true },
        })) {
          if (l.clienteId) ultimaCompra.set(l.clienteId, l._max.dtEmissao);
        }

        const [ano, mes] = hojeKey.split('-').map(Number);
        const inicioDoMes = `${hojeKey.slice(0, 8)}01`;
        const fimMesPassado = new Date(Date.UTC(ano, mes - 1, 0))
          .toISOString()
          .slice(0, 10);
        const inicioMesPassado = `${fimMesPassado.slice(0, 8)}01`;

        comprouMesPassado = await clientesQuePassaram(
          inicioMesPassado,
          fimMesPassado,
        );
        comprouNoMes = await clientesQuePassaram(inicioDoMes, hojeKey);
        comprouMesmoPeriodo = await clientesQuePassaram(
          mesmoDiaMesAnterior(params.dataInicio),
          mesmoDiaMesAnterior(params.dataFim),
        );
      }

      const titulos = new Map<string, { desde: Date; valor: number }>();
      if (criterios.tituloVencido) {
        for (const l of await tx.tituloReceber.groupBy({
          by: ['clienteId'],
          where: {
            clienteId: { in: ids },
            deletedAt: null,
            ativo: true,
            dtBaixa: null,
            vencimento: { lt: civil(hojeKey) },
            saldo: { gt: 0 },
          },
          _min: { vencimento: true },
          _sum: { saldo: true },
        })) {
          if (l.clienteId && l._min.vencimento) {
            titulos.set(l.clienteId, {
              desde: l._min.vencimento,
              valor: l._sum.saldo ?? 0,
            });
          }
        }
      }

      // Cliente que já está num roteiro em andamento no período não entra de
      // novo: o roteiro não deve marcar o mesmo cliente duas vezes.
      const inicioPeriodo = instanteLocal(params.dataInicio, '00:00');
      const fimPeriodo = new Date(
        instanteLocal(params.dataFim, '00:00').getTime() + 86_400_000,
      );
      const jaNoRoteiro = new Set(
        (
          await tx.whatsappRoteiroItem.findMany({
            where: {
              empresaId,
              status: { in: ['agendado', 'confirmado'] },
              quando: { gte: inicioPeriodo, lt: fimPeriodo },
            },
            select: { clienteId: true },
          })
        ).map((i) => i.clienteId),
      );

      const metricas: ClienteMetricas[] = clientes
        .filter((c) => !jaNoRoteiro.has(c.id))
        .map((c) => ({
          clienteId: c.id,
          nome: c.nomeFantasia || c.razaoSocial,
          ultimaCompra: ultimaCompra.get(c.id) ?? null,
          comprouMesPassado: comprouMesPassado.has(c.id),
          comprouNoMes: comprouNoMes.has(c.id),
          comprouMesmoPeriodoMesPassado: comprouMesmoPeriodo.has(c.id),
          tituloVencidoDesde: titulos.get(c.id)?.desde ?? null,
          valorVencido: titulos.get(c.id)?.valor ?? 0,
        }));

      const candidatos = selecionarCandidatos(
        metricas,
        criterios,
        civil(hojeKey),
      );

      // ---------------- quem dá para atender pelo WhatsApp ----------------
      const candidatoIds = candidatos.map((c) => c.clienteId);
      const sessao = await tx.whatsappSessao.findUnique({
        where: { empresaId_vendedorId: { empresaId, vendedorId: vendedor.id } },
        select: { id: true },
      });
      const comConversa = new Set(
        sessao && candidatoIds.length
          ? (
              await tx.whatsappConversa.findMany({
                where: { sessaoId: sessao.id, clienteId: { in: candidatoIds } },
                select: { clienteId: true },
              })
            )
              .map((c) => c.clienteId)
              .filter((id): id is string => !!id)
          : [],
      );
      const comContato = new Set(
        candidatoIds.length
          ? (
              await tx.whatsappContato.findMany({
                where: {
                  empresaId,
                  clienteId: { in: candidatoIds },
                  ignorado: false,
                },
                select: { clienteId: true },
              })
            )
              .map((c) => c.clienteId)
              .filter((id): id is string => !!id)
          : [],
      );
      const porId = new Map(clientes.map((c) => [c.id, c]));

      const semWhatsapp: RoteiroPrevia['semWhatsapp'] = [];
      const utilizaveis = candidatos.flatMap((c) => {
        const cliente = porId.get(c.clienteId)!;
        const origem: 'conversa' | 'contato' | 'cadastro' | null =
          comConversa.has(c.clienteId)
            ? 'conversa'
            : comContato.has(c.clienteId)
              ? 'contato'
              : temTelefone(
                    cliente.celular,
                    cliente.telefone,
                    cliente.telefone2,
                  )
                ? 'cadastro'
                : null;
        if (!origem) {
          semWhatsapp.push({
            clienteId: c.clienteId,
            clienteNome: c.nome,
            motivo: 'Sem conversa, vínculo nem telefone no cadastro',
          });
          return [];
        }
        return [{ ...c, origem }];
      });

      // ---------------- horários livres ----------------
      const expediente = await carregarExpedienteUsuario(tx, user.id);
      const usaCadastro = !!expediente?.restringir;
      const calendario = await carregarCalendarioUtil(tx, empresaId);
      const compromissos = await tx.atividade.findMany({
        where: {
          empresaId,
          vendedorId: vendedor.id,
          concluida: false,
          ativo: true,
          deletedAt: null,
          dataVencimento: { gte: inicioPeriodo, lt: fimPeriodo },
        },
        select: { dataVencimento: true },
      });
      const horarios = gerarHorariosLivres({
        dias: diasDoPeriodo(params.dataInicio, params.dataFim),
        calendario,
        expediente,
        padrao: {
          horaInicio: params.horaInicio ?? PADRAO_INICIO,
          horaFim: params.horaFim ?? PADRAO_FIM,
        },
        intervaloMin: params.intervaloMin,
        ocupados: ocupadosDaAgenda(
          compromissos.map((c) => c.dataVencimento!),
          params.intervaloMin,
        ),
        agora: new Date(),
      });

      const { alocados, semHorario } = distribuir(utilizaveis, horarios);

      return {
        itens: alocados.map(({ candidato: c, quando }) => ({
          clienteId: c.clienteId,
          clienteNome: c.nome,
          quando: quando.toISOString(),
          motivos: c.motivos,
          detalhe: c.detalhe,
          origem: c.origem,
        })),
        semHorario: semHorario.map((c) => ({
          clienteId: c.clienteId,
          clienteNome: c.nome,
        })),
        semWhatsapp,
        resumo: {
          candidatos: candidatos.length,
          horariosLivres: horarios.length,
          expediente: usaCadastro ? 'cadastro' : 'informado',
        },
      };
    });
  }

  // ------------------------------------------------------------------
  // Gravar, cancelar, remarcar e listar
  // ------------------------------------------------------------------

  /** O vendedor do usuário — o roteiro é sempre dele, para a carteira dele. */
  private async vendedorDoUsuario(
    tx: TenantTx,
    empresaId: string,
    usuarioId: string,
  ) {
    const vendedor = await tx.vendedor.findFirst({
      where: { usuarioId, empresaId, deletedAt: null },
      select: { id: true, nome: true },
    });
    if (!vendedor) {
      throw new BadRequestException(
        'Seu usuário não está vinculado a um cadastro de vendedor.',
      );
    }
    return vendedor;
  }

  /** Calendário, expediente e o que já ocupa a agenda do vendedor no intervalo. */
  private async contextoDaAgenda(
    tx: TenantTx,
    empresaId: string,
    usuarioId: string,
    vendedorId: string,
    de: Date,
    ate: Date,
    intervaloMin: number,
    ignorarAtividadeId?: string | null,
  ) {
    const calendario = await carregarCalendarioUtil(tx, empresaId);
    const expediente = await carregarExpedienteUsuario(tx, usuarioId);
    const compromissos = await tx.atividade.findMany({
      where: {
        empresaId,
        vendedorId,
        concluida: false,
        ativo: true,
        deletedAt: null,
        dataVencimento: { gte: de, lt: ate },
        ...(ignorarAtividadeId ? { id: { not: ignorarAtividadeId } } : {}),
      },
      select: { dataVencimento: true },
    });
    return {
      calendario,
      expediente,
      ocupados: ocupadosDaAgenda(
        compromissos.map((c) => c.dataVencimento!),
        intervaloMin,
      ),
    };
  }

  /**
   * O horário serve? Dia útil e dentro do expediente (o mesmo ajuste que as
   * demais agendas fazem: já válido, volta igual), no futuro e sem bater com
   * nada que já está marcado. Devolve o motivo da recusa, ou nulo.
   */
  private horarioInvalido(
    quando: Date,
    ctx: {
      calendario: CalendarioUtil;
      expediente: ExpedienteUsuario | null;
      ocupados: Ocupado[];
    },
    intervaloMin: number,
    reservados: Ocupado[],
  ): string | null {
    if (quando.getTime() < Date.now() + 5 * 60_000) {
      return 'o horário já passou (ou está muito perto)';
    }
    const ajustado = ajustarAoExpediente(
      quando,
      ctx.calendario,
      ctx.expediente,
    );
    if (ajustado.getTime() !== quando.getTime()) {
      return 'o horário cai em dia sem expediente, feriado ou fora do seu horário de trabalho';
    }
    const fim = quando.getTime() + intervaloMin * 60_000;
    const bate = [...ctx.ocupados, ...reservados].some(
      (o) => o.inicio.getTime() < fim && o.fim.getTime() > quando.getTime(),
    );
    return bate ? 'já há outro compromisso nesse horário' : null;
  }

  /**
   * Grava o roteiro que o vendedor revisou.
   *
   * **Nada do que veio da tela é confiado**: cada cliente precisa ser da
   * carteira dele e cada horário é conferido de novo — a prévia pode ter ficado
   * aberta enquanto a agenda mudava, e o horário editado à mão tem que passar
   * pelas mesmas regras do gerado.
   */
  async gravar(
    empresaId: string,
    user: AuthenticatedUser,
    input: RoteiroGravar,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await this.vendedorDoUsuario(tx, empresaId, user.id);
      const { parametros } = input;

      const ids = input.itens.map((i) => i.clienteId);
      if (new Set(ids).size !== ids.length) {
        throw new BadRequestException('Há cliente repetido no roteiro.');
      }
      const clientes = await tx.cliente.findMany({
        where: {
          id: { in: ids },
          empresaId,
          vendedorId: vendedor.id,
          ativo: true,
          deletedAt: null,
        },
        select: { id: true, razaoSocial: true, nomeFantasia: true },
      });
      if (clientes.length !== ids.length) {
        throw new BadRequestException(
          'Há cliente que não é da sua carteira (ou está inativo).',
        );
      }
      const nomePorId = new Map(
        clientes.map((c) => [c.id, c.nomeFantasia || c.razaoSocial]),
      );

      const inicio = instanteLocal(parametros.dataInicio, '00:00');
      const fim = new Date(
        instanteLocal(parametros.dataFim, '00:00').getTime() + 86_400_000,
      );

      const jaNoRoteiro = await tx.whatsappRoteiroItem.findMany({
        where: {
          empresaId,
          clienteId: { in: ids },
          status: { in: ['agendado', 'confirmado'] },
          quando: { gte: inicio, lt: fim },
        },
        select: { clienteId: true },
      });
      if (jaNoRoteiro.length > 0) {
        throw new BadRequestException(
          `${nomePorId.get(jaNoRoteiro[0].clienteId)} já está em outro roteiro neste período.`,
        );
      }

      const ctx = await this.contextoDaAgenda(
        tx,
        empresaId,
        user.id,
        vendedor.id,
        inicio,
        fim,
        parametros.intervaloMin,
      );
      const reservados: Ocupado[] = [];
      for (const item of [...input.itens].sort(
        (a, b) => a.quando.getTime() - b.quando.getTime(),
      )) {
        if (item.quando < inicio || item.quando >= fim) {
          throw new BadRequestException(
            `${nomePorId.get(item.clienteId)}: horário fora do período do roteiro.`,
          );
        }
        const motivo = this.horarioInvalido(
          item.quando,
          ctx,
          parametros.intervaloMin,
          reservados,
        );
        if (motivo) {
          throw new BadRequestException(
            `${nomePorId.get(item.clienteId)}: ${motivo}.`,
          );
        }
        reservados.push({
          inicio: item.quando,
          fim: new Date(
            item.quando.getTime() + parametros.intervaloMin * 60_000,
          ),
        });
      }

      // Quem já tem conversa nesta conexão: o item e a agenda já apontam para ela.
      const sessao = await tx.whatsappSessao.findUnique({
        where: { empresaId_vendedorId: { empresaId, vendedorId: vendedor.id } },
        select: { id: true },
      });
      const conversaPorCliente = new Map<string, string>();
      if (sessao) {
        for (const c of await tx.whatsappConversa.findMany({
          where: { sessaoId: sessao.id, clienteId: { in: ids } },
          select: { id: true, clienteId: true },
        })) {
          if (c.clienteId) conversaPorCliente.set(c.clienteId, c.id);
        }
      }

      const roteiro = await tx.whatsappRoteiro.create({
        data: {
          empresaId,
          usuarioId: user.id,
          vendedorId: vendedor.id,
          periodoInicio: civil(parametros.dataInicio),
          periodoFim: civil(parametros.dataFim),
          intervaloMin: parametros.intervaloMin,
          criterios: parametros.criterios,
          textoNota: input.textoNota,
        },
        select: { id: true },
      });

      for (const item of input.itens) {
        const conversaId = conversaPorCliente.get(item.clienteId) ?? null;
        const criado = await tx.whatsappRoteiroItem.create({
          data: {
            empresaId,
            roteiroId: roteiro.id,
            clienteId: item.clienteId,
            conversaId,
            quando: item.quando,
            motivos: item.motivos,
          },
          select: { id: true },
        });
        // O item também é um compromisso da agenda do vendedor: aparece lá, com
        // o cliente, e ocupa o horário para as próximas gerações.
        const atividade = await tx.atividade.create({
          data: {
            empresaId,
            vendedorId: vendedor.id,
            clienteId: item.clienteId,
            conversaId,
            tipo: 'tarefa',
            titulo: `Atendimento WhatsApp: ${nomePorId.get(item.clienteId)}`,
            descricao: item.detalhe ?? null,
            dataVencimento: item.quando,
            // O sistema inicia a conversa na hora (depois da confirmação):
            // não é tarefa do vendedor e não gera aviso de "vence hoje".
            automatica: true,
            roteiroItemId: criado.id,
            createdBy: user.id,
            updatedBy: user.id,
          },
          select: { id: true },
        });
        await tx.whatsappRoteiroItem.update({
          where: { id: criado.id },
          data: { atividadeId: atividade.id },
        });
      }
      return { roteiroId: roteiro.id, quantidade: input.itens.length };
    });
  }

  /** Vendedor, supervisor e gerente acima dele: quem a supervisão precisa avisar. */
  private async usuariosDaSupervisao(tx: TenantTx, vendedorId: string) {
    const usuarios = new Set<string>();
    let atual: string | null = vendedorId;
    // Três degraus bastam (vendedor → supervisor → gerente) e protegem contra ciclo.
    for (let i = 0; i < 3 && atual; i++) {
      const v: { superiorId: string | null } | null =
        await tx.vendedor.findUnique({
          where: { id: atual },
          select: { superiorId: true },
        });
      if (!v?.superiorId) break;
      const superior = await tx.vendedor.findUnique({
        where: { id: v.superiorId },
        select: { usuarioId: true },
      });
      if (superior?.usuarioId) usuarios.add(superior.usuarioId);
      atual = v.superiorId;
    }
    return [...usuarios];
  }

  /**
   * Cancela atendimentos do roteiro, um ou vários, **com motivo**. Só os que
   * ainda não começaram; saem da agenda; supervisão e gerência são avisadas.
   */
  async cancelar(
    empresaId: string,
    user: AuthenticatedUser,
    input: RoteiroCancelar,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const ids = [...new Set(input.itemIds)];
      const itens = await tx.whatsappRoteiroItem.findMany({
        where: { id: { in: ids }, empresaId, roteiro: { usuarioId: user.id } },
        include: { roteiro: { select: { vendedorId: true } } },
      });
      if (itens.length !== ids.length) {
        throw new NotFoundException('Atendimento do roteiro não encontrado.');
      }
      if (
        itens.some((i) => i.status !== 'agendado' && i.status !== 'confirmado')
      ) {
        throw new BadRequestException(
          'Só dá para cancelar atendimento que ainda não começou.',
        );
      }

      const agora = new Date();
      await tx.whatsappRoteiroItem.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'cancelado',
          motivoCancelamento: input.motivo,
          canceladoPor: user.id,
          canceladoEm: agora,
        },
      });
      // Cancelado não é pendência: sai da agenda.
      const atividadeIds = itens
        .map((i) => i.atividadeId)
        .filter((id): id is string => !!id);
      if (atividadeIds.length) {
        await tx.atividade.updateMany({
          where: { id: { in: atividadeIds }, empresaId, deletedAt: null },
          data: {
            ativo: false,
            deletedAt: agora,
            deletedBy: user.id,
            updatedBy: user.id,
          },
        });
      }

      const vendedor = await tx.vendedor.findUnique({
        where: { id: itens[0].roteiro.vendedorId },
        select: { nome: true },
      });
      const quantos = itens.length;
      const lote = randomUUID();
      for (const usuarioId of await this.usuariosDaSupervisao(
        tx,
        itens[0].roteiro.vendedorId,
      )) {
        await registrarNotificacao(tx, {
          empresaId,
          usuarioId,
          tipo: 'roteiro_cancelado',
          titulo: `${vendedor?.nome ?? 'Vendedor'} cancelou ${quantos} ${quantos === 1 ? 'atendimento' : 'atendimentos'} do roteiro`,
          descricao: input.motivo,
          rota: '/crm/agenda',
          // Cada cancelamento é um aviso próprio: o mesmo vendedor pode cancelar
          // de novo depois, e as duas ocasiões não se fundem.
          referenciaId: lote,
          autorUsuarioId: user.id,
        });
      }
      return { canceladas: quantos };
    });
  }

  /** Muda o horário de um atendimento (que ainda não começou), com motivo. */
  async remarcar(
    empresaId: string,
    user: AuthenticatedUser,
    itemId: string,
    input: RoteiroRemarcar,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const item = await tx.whatsappRoteiroItem.findFirst({
        where: { id: itemId, empresaId, roteiro: { usuarioId: user.id } },
        include: {
          roteiro: { select: { vendedorId: true, intervaloMin: true } },
        },
      });
      if (!item)
        throw new NotFoundException('Atendimento do roteiro não encontrado.');
      if (item.status !== 'agendado' && item.status !== 'confirmado') {
        throw new BadRequestException(
          'Só dá para remarcar atendimento que ainda não começou.',
        );
      }

      const dia = diaLocal(input.quando);
      const ctx = await this.contextoDaAgenda(
        tx,
        empresaId,
        user.id,
        item.roteiro.vendedorId,
        instanteLocal(dia, '00:00'),
        new Date(instanteLocal(dia, '00:00').getTime() + 86_400_000),
        item.roteiro.intervaloMin,
        item.atividadeId,
      );
      const motivoRecusa = this.horarioInvalido(
        input.quando,
        ctx,
        item.roteiro.intervaloMin,
        [],
      );
      if (motivoRecusa) {
        throw new BadRequestException(
          `Não dá para remarcar para esse horário: ${motivoRecusa}.`,
        );
      }

      const ajustes = Array.isArray(item.ajustes) ? item.ajustes : [];
      await tx.whatsappRoteiroItem.update({
        where: { id: itemId },
        data: {
          quando: input.quando,
          // Novo horário, nova confirmação.
          status: 'agendado',
          confirmadoEm: null,
          avisoAtrasoEm: null,
          ajustes: [
            ...ajustes,
            {
              tipo: 'remarcado',
              de: item.quando.toISOString(),
              para: input.quando.toISOString(),
              motivo: input.motivo,
              por: user.id,
              em: new Date().toISOString(),
            },
          ],
        },
      });
      if (item.atividadeId) {
        await tx.atividade.updateMany({
          where: { id: item.atividadeId, empresaId },
          data: { dataVencimento: input.quando, updatedBy: user.id },
        });
      }
      return { remarcado: true };
    });
  }

  /** Os itens do roteiro do usuário no intervalo, para a Agenda mostrar e agir. */
  async listarItens(
    empresaId: string,
    user: AuthenticatedUser,
    query: RoteiroItensQuery,
  ): Promise<RoteiroItem[]> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const de = instanteLocal(query.de, '00:00');
      const ate = new Date(
        instanteLocal(query.ate, '00:00').getTime() + 86_400_000,
      );
      const itens = await tx.whatsappRoteiroItem.findMany({
        where: {
          empresaId,
          roteiro: { usuarioId: user.id },
          quando: { gte: de, lt: ate },
        },
        orderBy: { quando: 'asc' },
        take: 500,
      });
      const clientes = itens.length
        ? await tx.cliente.findMany({
            where: { id: { in: [...new Set(itens.map((i) => i.clienteId))] } },
            select: { id: true, razaoSocial: true, nomeFantasia: true },
          })
        : [];
      const nome = new Map(
        clientes.map((c) => [c.id, c.nomeFantasia || c.razaoSocial]),
      );
      return itens.map((i) => ({
        id: i.id,
        roteiroId: i.roteiroId,
        atividadeId: i.atividadeId,
        clienteId: i.clienteId,
        clienteNome: nome.get(i.clienteId) ?? 'Cliente',
        conversaId: i.conversaId,
        quando: i.quando.toISOString(),
        status: i.status,
        motivos: (i.motivos as RoteiroMotivo[]) ?? [],
        erro: i.erro,
        resultado: i.resultado,
        motivoCancelamento: i.motivoCancelamento,
      }));
    });
  }

  private vazia(expediente: 'cadastro' | 'informado'): RoteiroPrevia {
    return {
      itens: [],
      semHorario: [],
      semWhatsapp: [],
      resumo: { candidatos: 0, horariosLivres: 0, expediente },
    };
  }
}
