import type { ParametrosService } from '../../modules/parametros/parametros.service';
import type { ConfiguracaoSmtp } from './mail.service';

/**
 * SMTP dos parâmetros da empresa (Administração > Parâmetros, `SMTP_*`).
 * Sem `SMTP_HOST` devolve null, e o `MailService` cai na configuração do
 * ambiente. Um lugar só: o e-mail de senha e o de documentos usam a mesma.
 */
export async function smtpDaEmpresa(
  parametros: ParametrosService,
  empresaId: string,
): Promise<ConfiguracaoSmtp | null> {
  const host = await parametros.obterTexto(empresaId, 'SMTP_HOST');
  if (!host) return null;
  return {
    host,
    porta: await parametros.obterNumero(empresaId, 'SMTP_PORTA', 587),
    seguro: await parametros.obterBoolean(empresaId, 'SMTP_SEGURO', false),
    usuario: await parametros.obterTexto(empresaId, 'SMTP_USUARIO'),
    senha: await parametros.obterTexto(empresaId, 'SMTP_SENHA'),
    remetente: await parametros.obterTexto(empresaId, 'SMTP_REMETENTE'),
  };
}
