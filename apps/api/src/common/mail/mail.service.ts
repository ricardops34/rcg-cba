import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/** Configuração de envio — vem dos parâmetros da empresa ou do ambiente. */
export interface ConfiguracaoSmtp {
  host: string;
  porta: number;
  seguro: boolean;
  usuario?: string | null;
  senha?: string | null;
  remetente?: string | null;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  /**
   * Configuração do ambiente (SMTP_HOST etc.), usada quando a empresa não tem
   * os parâmetros preenchidos. Sem host não há para onde enviar: o nodemailer
   * tentaria resolver um host vazio e só falharia depois do timeout.
   */
  private readonly doAmbiente: ConfiguracaoSmtp | null =
    process.env.SMTP_HOST?.trim()
      ? {
          host: process.env.SMTP_HOST.trim(),
          porta: Number(process.env.SMTP_PORT ?? 587),
          seguro: process.env.SMTP_SECURE === 'true',
          usuario: process.env.SMTP_USER,
          senha: process.env.SMTP_PASSWORD,
          remetente: process.env.MAIL_FROM,
        }
      : null;

  /** Há como enviar? Considera a configuração da empresa, se informada. */
  configurado(daEmpresa?: ConfiguracaoSmtp | null): boolean {
    return !!(daEmpresa?.host?.trim() || this.doAmbiente);
  }

  /**
   * Envia o e-mail e devolve se saiu. `false` quando não há SMTP configurado
   * — nesse caso nem tenta conectar. Erros de envio propagam: quem chama
   * decide se são fatais.
   */
  async send(
    to: string,
    subject: string,
    html: string,
    daEmpresa?: ConfiguracaoSmtp | null,
  ): Promise<boolean> {
    const cfg = daEmpresa?.host?.trim() ? daEmpresa : this.doAmbiente;
    if (!cfg) {
      this.logger.warn(
        `SMTP não configurado (nem parâmetro da empresa, nem SMTP_HOST) — e-mail para ${to} não enviado: ${subject}`,
      );
      return false;
    }

    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.porta || 587,
      secure: cfg.seguro,
      auth: cfg.usuario
        ? { user: cfg.usuario, pass: cfg.senha ?? '' }
        : undefined,
    });
    await transporter.sendMail({
      from: cfg.remetente || 'no-reply@plataforma.local',
      to,
      subject,
      html,
    });
    this.logger.log(`E-mail enviado para ${to}: ${subject}`);
    return true;
  }
}
