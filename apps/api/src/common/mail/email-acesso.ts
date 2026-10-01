import { escapeHtml } from '../html/escape-html';
import { layoutEmail, type EmpresaDoEmail } from './email-layout';

export type { EmpresaDoEmail } from './email-layout';

/**
 * E-mail com a senha provisória de acesso — criado ou redefinido.
 *
 * Leva o que faltava no texto antigo (pedido do usuário, 01/10/2026): quem
 * está enviando (os dados da empresa) e por onde entrar (o link de login já
 * com o alias da empresa, que traz o logo e o nome dela na tela de login).
 *
 * Sem o logo: o arquivo é servido pela API, cujo endereço público a API não
 * conhece, e boa parte dos leitores de e-mail bloqueia imagem externa — o
 * nome da empresa em texto chega sempre.
 */

/**
 * Endereço do sistema para quem recebe o e-mail: `WEB_URL`, ou o primeiro
 * `CORS_ORIGIN` — que já é o endereço da tela (em produção,
 * https://plataforma.rcgdist.com.br), então não exige configuração nova.
 */
export function urlDoSistema(): string | null {
  const url =
    process.env.WEB_URL?.trim() ||
    process.env.CORS_ORIGIN?.split(',')[0]?.trim() ||
    '';
  return url ? url.replace(/\/+$/, '') : null;
}

/** Login da empresa: `/login?empresa=<alias>`, ou só `/login` sem alias. */
export function linkDeAcesso(alias: string | null): string | null {
  const base = urlDoSistema();
  if (!base) return null;
  return alias
    ? `${base}/login?empresa=${encodeURIComponent(alias)}`
    : `${base}/login`;
}

export function montarEmailAcesso(dados: {
  empresa: EmpresaDoEmail;
  nome: string;
  login: string;
  senha: string;
  /** `criado`: primeiro acesso; `redefinida`: senha trocada pelo gestor. */
  motivo: 'criado' | 'redefinida';
}): { assunto: string; html: string } {
  const { empresa, motivo } = dados;
  const nomeEmpresa = escapeHtml(empresa.nomeFantasia);
  const link = linkDeAcesso(empresa.alias);

  const assunto =
    motivo === 'criado'
      ? `Seu acesso à plataforma — ${empresa.nomeFantasia}`
      : `Nova senha provisória — ${empresa.nomeFantasia}`;
  const abertura =
    motivo === 'criado'
      ? `A <strong>${nomeEmpresa}</strong> criou um acesso para você na plataforma comercial.`
      : `Sua senha de acesso à plataforma comercial da <strong>${nomeEmpresa}</strong> foi redefinida.`;

  const botao = link
    ? `
      <p style="margin:24px 0">
        <a href="${escapeHtml(link)}"
           style="background:#1d4ed8;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:bold;display:inline-block">
          Acessar a plataforma
        </a>
      </p>
      <p style="font-size:12px;color:#555">
        Se o botão não abrir, copie este endereço no navegador:<br>
        <a href="${escapeHtml(link)}" style="color:#1d4ed8">${escapeHtml(link)}</a>
      </p>`
    : '';

  const html = layoutEmail(
    empresa,
    `
    <p>Olá, ${escapeHtml(dados.nome)}!</p>
    <p>${abertura}</p>
    <table style="border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:2px 12px 2px 0"><strong>Login:</strong></td><td>${escapeHtml(dados.login)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0"><strong>${motivo === 'criado' ? 'Senha provisória' : 'Nova senha provisória'}:</strong></td><td style="font-family:Consolas,monospace">${escapeHtml(dados.senha)}</td></tr>
    </table>
    <p>Por segurança, você precisará trocar essa senha no primeiro acesso.</p>
    ${botao}`,
  );

  return { assunto, html };
}
