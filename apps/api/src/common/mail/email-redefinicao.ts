import { escapeHtml } from '../html/escape-html';
import { layoutEmail, type EmpresaDoEmail } from './email-layout';

/**
 * E-mail do "Esqueci minha senha": o link de uso único para criar uma senha
 * nova. Diz por quanto tempo vale e que, se não foi a pessoa que pediu, basta
 * ignorar — a senha atual continua valendo até o link ser usado.
 *
 * Com empresa, sai no layout dela (nome e dados no rodapé), como o e-mail de
 * acesso; sem empresa (usuário só da plataforma), num HTML simples.
 */
export function montarEmailRedefinicao(dados: {
  empresa: EmpresaDoEmail | null;
  nome: string;
  link: string;
  validadeMinutos: number;
}): { assunto: string; html: string } {
  const nomeSistema = dados.empresa?.nomeFantasia ?? 'Plataforma';
  const assunto = `Redefinição de senha — ${nomeSistema}`;
  const link = escapeHtml(dados.link);

  const corpo = `
    <p>Olá, ${escapeHtml(dados.nome)}!</p>
    <p>Recebemos um pedido para redefinir a sua senha de acesso à plataforma${
      dados.empresa
        ? ` da <strong>${escapeHtml(dados.empresa.nomeFantasia)}</strong>`
        : ''
    }.</p>
    <p style="margin:24px 0">
      <a href="${link}"
         style="background:#1d4ed8;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:bold;display:inline-block">
        Criar nova senha
      </a>
    </p>
    <p>O link vale por <strong>${dados.validadeMinutos} minutos</strong> e funciona uma vez só.</p>
    <p style="font-size:12px;color:#555">
      Se o botão não abrir, copie este endereço no navegador:<br>
      <a href="${link}" style="color:#1d4ed8">${link}</a>
    </p>
    <p style="font-size:12px;color:#555">
      Não foi você que pediu? Ignore este e-mail: sua senha atual continua valendo.
    </p>`;

  const html = dados.empresa
    ? layoutEmail(dados.empresa, corpo, { temLogo: false })
    : `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">${corpo}</div>`;
  return { assunto, html };
}
