import type { Request, Response } from 'express';

/**
 * O refresh token vai num cookie `HttpOnly`, e não no corpo da resposta
 * guardado pelo navegador no `localStorage` (SEC-11, auditoria de 27/10/2026):
 * script nenhum da página — nem um XSS — lê o que vale por dias.
 *
 * `Path` restrito às rotas de autenticação: o navegador só o envia para
 * `/api/v1/auth/...`, não a cada chamada da API. `SameSite=Strict` porque o
 * front chama a API **no mesmo endereço em que foi aberto** (`/api/v1`
 * relativo, roteado pelo Traefik — ver "Imagem única e um domínio por
 * cliente" no runbook); com a API em outro site o cookie não seria enviado.
 */
export const COOKIE_REFRESH = 'rt';
const CAMINHO = '/api/v1/auth';
/** Mesmo prazo do refresh token no banco (`REFRESH_TTL_MS` do `AuthService`). */
const DURACAO_MS = 7 * 24 * 60 * 60 * 1000;

/** `Secure` em produção (HTTPS atrás do Traefik); `COOKIE_SECURE` força um lado. */
function seguro(): boolean {
  const forcado = process.env.COOKIE_SECURE;
  if (forcado === 'true') return true;
  if (forcado === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

/** Lê um cookie do cabeçalho, sem depender do `cookie-parser`. */
export function lerCookie(req: Request, nome: string): string | undefined {
  const cabecalho = req.headers?.cookie;
  if (!cabecalho) return undefined;
  for (const parte of cabecalho.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() !== nome) continue;
    try {
      return decodeURIComponent(parte.slice(i + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function gravarCookieRefresh(res: Response, token: string): void {
  res.cookie(COOKIE_REFRESH, token, {
    httpOnly: true,
    secure: seguro(),
    sameSite: 'strict',
    path: CAMINHO,
    maxAge: DURACAO_MS,
  });
}

export function limparCookieRefresh(res: Response): void {
  res.clearCookie(COOKIE_REFRESH, {
    httpOnly: true,
    secure: seguro(),
    sameSite: 'strict',
    path: CAMINHO,
  });
}
