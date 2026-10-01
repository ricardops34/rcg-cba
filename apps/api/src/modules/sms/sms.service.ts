import { createHmac } from 'node:crypto';
import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { SmsMotivo } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ParametrosService } from '../parametros/parametros.service';

/**
 * Envio de SMS pela iAgente (docs/planos/2026-10-01-sms-iagente.md).
 *
 * API v2: `POST /messages` com token Bearer, número `55DDDNÚMERO`. O token é
 * da empresa (parâmetro `SMS_TOKEN`); sem ele, SMS não está configurado.
 *
 * Todo envio — saído ou recusado — vira linha em `sms_envios`: é a resposta a
 * "o cliente recebeu?" e o que impede o aviso automático de repetir.
 */
export const IAGENTE_URL = 'https://api.iagentesms.com.br/api/v2';

/** Celular brasileiro em `55DDD9XXXXXXXX`, ou null se não for celular. */
export function normalizarCelular(
  valor: string | null | undefined,
): string | null {
  let d = (valor ?? '').replace(/\D/g, '');
  if (!d) return null;
  // Prefixos de discagem: 0 de longa distância, 0XX da operadora.
  d = d.replace(/^0+/, '');
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 12 && d.startsWith('55')) return null; // fixo com país
  if (d.length === 10) return null; // fixo: DDD + 8 dígitos
  // Celular: DDD (2) + 9 + 8 dígitos. Fixo não recebe SMS.
  if (d.length !== 11 || d[2] !== '9') return null;
  return `55${d}`;
}

/** O primeiro celular válido entre os campos do cadastro. */
export function primeiroCelular(...valores: Array<string | null | undefined>) {
  for (const v of valores) {
    const celular = normalizarCelular(v);
    if (celular) return celular;
  }
  return null;
}

/**
 * Texto para SMS: sem acento (algumas operadoras trocam o caractere) e sem
 * quebras duplicadas. O tamanho é de quem monta — acima de 160 vira mais de
 * um segmento, e a iAgente cobra cada um.
 */
export function textoSms(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Segredo da URL do webhook de uma empresa. A iAgente não assina o webhook:
 * quem tem a URL pode chamá-la, então ela leva um segredo derivado de uma
 * chave do servidor (mesmo esquema do link assinado de uploads). Trocar o
 * JWT_ACCESS_SECRET troca a URL — é preciso recadastrar no painel.
 */
export function segredoWebhook(empresaId: string): string {
  const chave = process.env.JWT_ACCESS_SECRET;
  if (!chave) throw new Error('JWT_ACCESS_SECRET não configurado');
  return createHmac('sha256', chave)
    .update(`sms-webhook:v1:${empresaId}`)
    .digest('base64url')
    .slice(0, 32);
}

export type SaldoSms = {
  modalidade: string | null;
  disponivel: number | null;
  limiteSeguranca: number | null;
  consumoMes: number | null;
};

export type EnvioSms = {
  empresaId: string;
  motivo: SmsMotivo;
  celular: string;
  mensagem: string;
  clienteId?: string | null;
  vendedorId?: string | null;
  tituloReceberId?: string | null;
  /** Usuário que pediu; null no aviso automático. */
  autor: string | null;
};

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
  ) {}

  private token(empresaId: string) {
    return this.parametros.obterTexto(empresaId, 'SMS_TOKEN');
  }

  async configurado(empresaId: string) {
    return !!(await this.token(empresaId))?.trim();
  }

  /**
   * Envia e registra. Lança 409 sem configuração e 502 quando a iAgente
   * recusa — quem chama da tela quer ver o motivo. Quem não pode falhar (a
   * senha, o aviso automático) usa `tentar`.
   */
  async enviar(
    envio: EnvioSms,
  ): Promise<{ id: string; provedorId: string | null }> {
    const token = (await this.token(envio.empresaId))?.trim();
    if (!token) {
      throw new ConflictException(
        'Envio de SMS não configurado. Informe o token da iAgente no parâmetro SMS_TOKEN (Administração > Parâmetros).',
      );
    }
    const mensagem = textoSms(envio.mensagem);

    // O registro nasce antes do envio: o id dele vai como client_ref (é por
    // ele que o webhook devolve status e resposta do cliente) e como
    // Idempotency-Key (uma nova tentativa não manda o SMS duas vezes).
    const registro = await this.prisma.withTenant(envio.empresaId, (tx) =>
      tx.smsEnvio.create({
        data: {
          empresaId: envio.empresaId,
          motivo: envio.motivo,
          celular: envio.celular,
          mensagem,
          clienteId: envio.clienteId ?? null,
          vendedorId: envio.vendedorId ?? null,
          tituloReceberId: envio.tituloReceberId ?? null,
          status: 'enviando',
          createdBy: envio.autor,
        },
        select: { id: true },
      }),
    );

    let provedorId: string | null = null;
    let status = 'erro';
    let erro: string | null = null;
    try {
      const resposta = await fetch(`${IAGENTE_URL}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': registro.id,
        },
        body: JSON.stringify({
          to: envio.celular,
          message: mensagem,
          client_ref: registro.id,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const corpo = (await resposta.json().catch(() => null)) as {
        data?: { id?: string; status?: string };
        error?: { code?: string; message?: string };
      } | null;
      if (resposta.ok) {
        provedorId = corpo?.data?.id ?? null;
        status = corpo?.data?.status ?? 'queued';
      } else {
        erro = corpo?.error?.message
          ? `${corpo.error.message}${corpo.error.code ? ` (${corpo.error.code})` : ''}`
          : `HTTP ${resposta.status}`;
      }
    } catch (falha) {
      erro = `Sem resposta da iAgente: ${(falha as Error).message}`;
    }

    await this.prisma.withTenant(envio.empresaId, (tx) =>
      tx.smsEnvio.update({
        where: { id: registro.id },
        data: { provedorId, status, erro, statusEm: new Date() },
      }),
    );

    if (erro) {
      this.logger.warn(`SMS para ${envio.celular} recusado: ${erro}`);
      throw new BadGatewayException(`A iAgente recusou o SMS: ${erro}`);
    }
    return { id: registro.id, provedorId };
  }

  /** Saldo na iAgente (`GET /credits`); null sem token. Lança 502 se ela recusar. */
  async saldo(empresaId: string): Promise<SaldoSms | null> {
    const token = (await this.token(empresaId))?.trim();
    if (!token) return null;
    let resposta: Response;
    try {
      resposta = await fetch(`${IAGENTE_URL}/credits`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (falha) {
      throw new BadGatewayException(
        `Sem resposta da iAgente: ${(falha as Error).message}`,
      );
    }
    const corpo = (await resposta.json().catch(() => null)) as {
      data?: {
        modalidade?: string;
        available?: number;
        limite_seguranca?: number;
        consumo_mes?: number;
      };
      error?: { code?: string; message?: string };
    } | null;
    if (!resposta.ok) {
      throw new BadGatewayException(
        `A iAgente recusou a consulta de saldo: ${corpo?.error?.message ?? `HTTP ${resposta.status}`}`,
      );
    }
    return {
      modalidade: corpo?.data?.modalidade ?? null,
      disponivel: corpo?.data?.available ?? null,
      limiteSeguranca: corpo?.data?.limite_seguranca ?? null,
      consumoMes: corpo?.data?.consumo_mes ?? null,
    };
  }

  /** Como `enviar`, mas devolve false em vez de lançar. */
  async tentar(envio: EnvioSms): Promise<boolean> {
    try {
      await this.enviar(envio);
      return true;
    } catch {
      return false;
    }
  }
}
