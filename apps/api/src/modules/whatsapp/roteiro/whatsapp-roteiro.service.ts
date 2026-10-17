import { BadRequestException, Injectable } from '@nestjs/common';
import type { RoteiroParametros, RoteiroPrevia } from '@plataforma/contracts';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { carregarCalendarioUtil } from '../../../common/horario/calendario-util';
import {
  carregarExpedienteUsuario,
  diaLocal,
  instanteLocal,
} from '../../../common/horario/expediente';
import {
  diasDoPeriodo,
  distribuir,
  gerarHorariosLivres,
  mesmoDiaMesAnterior,
  ocupadosDaAgenda,
  selecionarCandidatos,
  type ClienteMetricas,
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

  private vazia(expediente: 'cadastro' | 'informado'): RoteiroPrevia {
    return {
      itens: [],
      semHorario: [],
      semWhatsapp: [],
      resumo: { candidatos: 0, horariosLivres: 0, expediente },
    };
  }
}
