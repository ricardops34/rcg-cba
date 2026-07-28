import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });

  async send(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({
      from: process.env.MAIL_FROM ?? 'no-reply@plataforma.local',
      to,
      subject,
      html,
    });
    this.logger.log(`E-mail enviado para ${to}: ${subject}`);
  }
}
