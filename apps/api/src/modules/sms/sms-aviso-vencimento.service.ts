import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { SmsMotivo } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { whereEmpresaAcessivel } from '../../common/empresa/situacao-empresa';
import {
  HORARIO_TIMEZONE,
  momentoLocal,
} from '../../common/horario/horario-trabalho';
import { registrarAtividadeDocumento } from '../../common/atividades/registrar-atividade-documento';
import { buscarEmpresaDoEmail } from '../../common/mail/email-layout';
import { TitulosReceberService } from '../titulos-receber/titulos-receber.service';
import { primeiroCelular, SmsService, textoSms } from './sms.service';
import { dataSms } from './sms-cliente.service';

/** De quanto em quanto tempo a varredura roda. */
const INTERVALO_MS = 30 * 60_000;
/** Teto de SMS por empresa numa passagem — o resto sai na próxima. */
const LOTE = 100;
/** Atraso: avisa até 7 dias depois do dia combinado, se a API esteve fora. */
const TOLERANCIA_DIAS = 7;

const moeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "Hoje" no fuso da operação, como data civil (meia-noite UTC). */
function hojeCivil(agora = new Date()) {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: HORARIO_TIMEZONE,
  }).format(agora);
  return new Date(`${iso}T00:00:00.000Z`);
}
const somarDias = (d: Date, n: number) =>
  new Date(d.getTime() + n * 86_400_000);

/**
 * Aviso automático de vencimento por SMS (docs/planos/2026-10-01-sms-iagente.md).
 *
 * Manda SMS a cliente sem ninguém clicar, então tem três travas:
 *
 * - **Desligado por padrão** (Administração > SMS), por empresa;
 * - **Só das 8h às 18h, de segunda a sábado** (horário de Campo Grande) — SMS de
 *   cobrança de madrugada é reclamação certa;
 * - **Um aviso de cada tipo por título**, conferido em `sms_envios` — a
 *   varredura de 30 em 30 minutos não repete.
 *
 * Antes do vencimento: o título que vence em até os dias de antes dias,
 * com a linha digitável quando há boleto. Depois: o que venceu há
 * os dias de depois dias (ou um pouco mais, se a API esteve fora), com
 * o valor atualizado. Cada envio entra no histórico de atendimento.
 */
@Injectable()
export class SmsAvisoVencimentoService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SmsAvisoVencimentoService.name);
  private timer: NodeJS.Timeout | null = null;
  private rodando = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly titulos: TitulosReceberService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.varrer(), INTERVALO_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Dentro da janela em que SMS automático pode sair. */
  static podeEnviarAgora(agora = new Date()) {
    const { diaSemana, hora } = momentoLocal(agora);
    return (
      diaSemana >= 1 && diaSemana <= 6 && hora >= '08:00' && hora < '18:00'
    );
  }

  async varrer(agora = new Date()) {
    if (this.rodando || !SmsAvisoVencimentoService.podeEnviarAgora(agora))
      return;
    this.rodando = true;
    try {
      const empresas = await this.prisma.empresa.findMany({
        where: { deletedAt: null, ...whereEmpresaAcessivel() },
        select: { id: true },
      });
      for (const { id } of empresas) {
        // SMS ativo, com token e o aviso ligado — Administração > SMS.
        if (!(await this.sms.disponibilidade(id)).avisoVencimento) continue;
        await this.avisarEmpresa(id, hojeCivil(agora));
      }
    } catch (erro) {
      this.logger.error(`Falha no aviso de vencimento por SMS: ${erro}`);
    } finally {
      this.rodando = false;
    }
  }

  private async avisarEmpresa(empresaId: string, hoje: Date) {
    const config = await this.sms.config(empresaId);
    const antes = config?.avisoDiasAntes ?? 0;
    const depois = config?.avisoDiasDepois ?? 0;
    let restantes = LOTE;
    if (antes > 0) {
      restantes -= await this.avisar(
        empresaId,
        'aviso_antes_vencimento',
        {
          gte: hoje,
          lte: somarDias(hoje, antes),
        },
        restantes,
      );
    }
    if (depois > 0 && restantes > 0) {
      await this.avisar(
        empresaId,
        'aviso_depois_vencimento',
        {
          gte: somarDias(hoje, -(depois + TOLERANCIA_DIAS)),
          lte: somarDias(hoje, -depois),
        },
        restantes,
      );
    }
  }

  /** Avisa os títulos do intervalo que ainda não receberam este aviso. */
  private async avisar(
    empresaId: string,
    motivo: SmsMotivo,
    vencimento: { gte: Date; lte: Date },
    limite: number,
  ): Promise<number> {
    const titulos = await this.prisma.withTenant(empresaId, async (tx) => {
      // Já avisado = saiu um SMS (status diferente de erro). Falha não conta,
      // senão um token inválido marcaria todo mundo como avisado — mas três
      // falhas no mesmo título encerram as tentativas.
      const tentativas = await tx.smsEnvio.findMany({
        where: { empresaId, motivo, tituloReceberId: { not: null } },
        select: { tituloReceberId: true, status: true },
      });
      const falhas = new Map<string, number>();
      const avisados = new Set<string>();
      for (const t of tentativas) {
        if (t.status === 'erro') {
          const n = (falhas.get(t.tituloReceberId!) ?? 0) + 1;
          falhas.set(t.tituloReceberId!, n);
          if (n >= 3) avisados.add(t.tituloReceberId!);
        } else {
          avisados.add(t.tituloReceberId!);
        }
      }
      return tx.tituloReceber.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ativo: true,
          saldo: { gt: 0 },
          dtBaixa: null,
          vencimento,
          clienteId: { not: null },
          id: { notIn: [...avisados] },
        },
        orderBy: { vencimento: 'asc' },
        take: limite,
        select: {
          id: true,
          numero: true,
          parcela: true,
          vencimento: true,
          saldo: true,
          clienteId: true,
          vendedorId: true,
          cliente: {
            select: { celular: true, telefone: true, telefone2: true },
          },
        },
      });
    });
    if (titulos.length === 0) return 0;

    const empresa = await buscarEmpresaDoEmail(this.prisma, empresaId);
    let enviados = 0;
    for (const t of titulos) {
      const celular = primeiroCelular(
        t.cliente?.celular,
        t.cliente?.telefone,
        t.cliente?.telefone2,
      );
      if (!celular) continue;
      const numero = `${t.numero}${t.parcela ? `/${t.parcela}` : ''}`;

      // Boleto pelo recorte do próprio cliente — o mesmo do WhatsApp dele.
      let linha: string | null = null;
      let valor = Number(t.saldo);
      try {
        const boleto = await this.titulos.gerarBoleto(
          empresaId,
          { tipo: 'cliente', clienteId: t.clienteId! },
          t.id,
          { registrarEvento: false, atualizado: true },
        );
        linha = boleto.linhaDigitavel ?? null;
        valor = boleto.valor;
      } catch {
        // Sem 2ª via de boleto: o aviso sai sem a linha digitável.
      }

      const mensagem = textoSms(
        motivo === 'aviso_antes_vencimento'
          ? `${empresa.nomeFantasia}: lembrete, o titulo ${numero} vence em ${dataSms(t.vencimento)}, ${moeda(valor)}.` +
              (linha ? ` Linha digitavel: ${linha}` : '')
          : `${empresa.nomeFantasia}: o titulo ${numero} venceu em ${dataSms(t.vencimento)}, valor atualizado ${moeda(valor)}.` +
              (linha ? ` Linha digitavel: ${linha}.` : '') +
              ' Se ja pagou, desconsidere.',
      );
      const saiu = await this.sms.tentar({
        empresaId,
        motivo,
        celular,
        mensagem,
        clienteId: t.clienteId,
        vendedorId: t.vendedorId,
        tituloReceberId: t.id,
        autor: null,
      });
      if (!saiu) continue;
      enviados += 1;
      await this.prisma.withTenant(empresaId, (tx) =>
        registrarAtividadeDocumento(tx, {
          empresaId,
          autor: null,
          evento: 'aviso_vencimento_sms',
          clienteId: t.clienteId,
          vendedorId: t.vendedorId,
          numero,
          descricao: `${motivo === 'aviso_antes_vencimento' ? 'Lembrete antes do vencimento' : 'Aviso de atraso'} · ${celular} · ${moeda(valor)}`,
        }),
      );
    }
    if (enviados)
      this.logger.log(`${enviados} aviso(s) de vencimento por SMS (${motivo})`);
    return enviados;
  }
}
