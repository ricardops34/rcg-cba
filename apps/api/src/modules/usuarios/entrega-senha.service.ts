import { Injectable, Logger } from '@nestjs/common';
import { linkDeAcesso, montarEmailAcesso } from '../../common/mail/email-acesso';
import { buscarEmpresaDoEmail } from '../../common/mail/email-layout';
import { MailService } from '../../common/mail/mail.service';
import { smtpDaEmpresa } from '../../common/mail/smtp-da-empresa';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailConfigService } from '../email/email-config.service';
import { ParametrosService } from '../parametros/parametros.service';
import { SmsService, primeiroCelular, textoSms } from '../sms/sms.service';

export interface EntregaDaSenha {
  emailEnviado: boolean;
  smsEnviado: boolean;
  /**
   * Só vem quando nem o e-mail nem o SMS saíram: sem isso ninguém saberia a
   * senha e o acesso nasceria inutilizável. O admin repassa uma única vez.
   */
  senhaProvisoria?: string;
}

/**
 * Entrega a senha provisória de um usuário — e-mail e, se houver celular, SMS.
 * Mesmo comportamento do cadastro de vendedores: a senha já está gravada
 * quando isto roda, então falha de envio nunca desfaz a operação.
 */
@Injectable()
export class EntregaSenhaService {
  private readonly logger = new Logger(EntregaSenhaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly parametros: ParametrosService,
    private readonly sms: SmsService,
    private readonly emailConfig: EmailConfigService,
  ) {}

  async entregar(
    empresaId: string,
    actorId: string,
    dados: {
      nome: string;
      email: string;
      celular: string | null;
      senha: string;
      motivo: 'criado' | 'redefinida';
    },
  ): Promise<EntregaDaSenha> {
    const empresa = await buscarEmpresaDoEmail(this.prisma, empresaId);
    const mensagem = montarEmailAcesso({
      empresa,
      nome: dados.nome,
      login: dados.email,
      senha: dados.senha,
      motivo: dados.motivo,
    });

    const emailEnviado = await this.porEmail(
      empresaId,
      dados.email,
      mensagem.assunto,
      mensagem.html,
    );
    const smsEnviado = await this.porSms(empresaId, actorId, {
      nomeEmpresa: empresa.nomeFantasia,
      alias: empresa.alias,
      celular: dados.celular,
      login: dados.email,
      senha: dados.senha,
    });

    return {
      emailEnviado,
      smsEnviado,
      senhaProvisoria: emailEnviado || smsEnviado ? undefined : dados.senha,
    };
  }

  private async porEmail(
    empresaId: string,
    para: string,
    assunto: string,
    html: string,
  ): Promise<boolean> {
    // Envio habilitado, com servidor e a senha provisória ligada
    // (Administração > E-mail).
    if (!(await this.emailConfig.disponibilidade(empresaId)).senhaProvisoria) {
      return false;
    }
    try {
      const smtp = await smtpDaEmpresa(this.parametros, empresaId);
      return await this.mailService.send(para, assunto, html, smtp);
    } catch (erro) {
      this.logger.error(
        `Falha ao enviar senha provisória para ${para}: ${(erro as Error).message}`,
      );
      return false;
    }
  }

  private async porSms(
    empresaId: string,
    actorId: string,
    dados: {
      nomeEmpresa: string;
      alias: string | null;
      celular: string | null;
      login: string;
      senha: string;
    },
  ): Promise<boolean> {
    const celular = primeiroCelular(dados.celular);
    // SMS ativo, com token e a senha provisória ligada (Administração > SMS).
    if (!celular || !(await this.sms.disponibilidade(empresaId)).senhaProvisoria) {
      return false;
    }
    const link = linkDeAcesso(dados.alias);
    return this.sms.tentar({
      empresaId,
      motivo: 'senha_provisoria',
      celular,
      mensagem: textoSms(
        `${dados.nomeEmpresa}: acesso a plataforma. Login: ${dados.login} Senha provisoria: ${dados.senha}` +
          (link ? ` Acesse: ${link}` : ''),
      ),
      autor: actorId,
    });
  }
}
