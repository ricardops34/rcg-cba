import { useAuthStore } from "@/stores/auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

/** Origem da API (sem o prefixo /api/v1), usada para servir assets como logos. */
export const API_ORIGIN = new URL(API_URL).origin;

/** Monta a URL absoluta de um asset servido pela API (ex.: /uploads/logos/x.png). */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

/**
 * Código que a API manda no corpo do 403 quando o acesso é recusado por
 * horário de trabalho (ver ForaDoExpedienteException na API). Diferente de uma
 * falta de permissão: a sessão acabou de ser encerrada no servidor, então a
 * tela precisa voltar ao login em vez de só avisar.
 */
const CODIGO_FORA_HORARIO = "FORA_HORARIO";

export function ehForaDoExpediente(erro: unknown): boolean {
  return (
    erro instanceof ApiError &&
    erro.status === 403 &&
    (erro.details as { codigo?: string } | undefined)?.codigo === CODIGO_FORA_HORARIO
  );
}

/**
 * Fim de expediente durante o uso: os tokens já foram revogados no servidor,
 * então limpa a sessão local e manda para o login com o motivo — sem isso a
 * tela ficaria repetindo 403 em cada consulta.
 */
function encerrarPorHorario(mensagem: string) {
  const { logout } = useAuthStore.getState();
  logout();
  if (typeof window !== "undefined") {
    sessionStorage.setItem("plataforma-auth-motivo", mensagem);
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }
}

let refreshPromise: Promise<string | null> | null = null;

/** Lê a claim empresaAtivaId de um access token sem validar assinatura — só pra
 *  detectar localmente se o refresh trocou de empresa (ver comentário abaixo). */
function empresaAtivaIdDoToken(accessToken: string): string | null {
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1]));
    return payload.empresaAtivaId ?? null;
  } catch {
    return null;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, user, setTokens, setUser, logout } = useAuthStore.getState();
  if (!refreshToken) return null;

  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    // Renovar fora do expediente é recusado com o mesmo 403 das demais rotas
    // — aqui a mensagem é a que explica ao usuário por que ele caiu.
    const payload = await res.json().catch(() => ({}));
    if (
      res.status === 403 &&
      (payload.details as { codigo?: string } | undefined)?.codigo === CODIGO_FORA_HORARIO
    ) {
      encerrarPorHorario(payload.message ?? "Acesso permitido apenas em horário de trabalho.");
      return null;
    }
    logout();
    return null;
  }

  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);

  // O refresh normalmente mantém a mesma empresa ativa da sessão, mas pode
  // cair em outra (ex.: vínculo original não existe mais) — se isso
  // acontecer sem resincronizar `user`, a topbar mostra a empresa errada
  // (cache velho) enquanto as chamadas já usam o token da empresa nova.
  if (empresaAtivaIdDoToken(data.accessToken) !== user?.empresaAtivaId) {
    const meRes = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    });
    if (meRes.ok) setUser(await meRes.json());
  }

  return data.accessToken as string;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query } = options;

  const url = new URL(`${API_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const doRequest = async (token: string | null) => {
    return fetch(url.toString(), {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  let token = useAuthStore.getState().accessToken;
  let res = await doRequest(token);

  if (res.status === 401 && useAuthStore.getState().refreshToken) {
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
    token = await refreshPromise;
    if (token) res = await doRequest(token);
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    const erro = new ApiError(payload.message ?? res.statusText, res.status, payload.details);
    if (ehForaDoExpediente(erro)) encerrarPorHorario(erro.message);
    throw erro;
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Envia um arquivo (multipart/form-data) com autenticação e refresh de token.
 *
 * Aceita um `File` (caso simples, campo único) ou um `FormData` já montado,
 * para quando o upload leva outros campos junto — o anexo de WhatsApp manda
 * legenda e o indicador de mensagem de voz no mesmo envio.
 */
export async function apiUpload<T>(
  path: string,
  arquivo: File | FormData,
  field = "file",
): Promise<T> {
  const url = `${API_URL}${path}`;

  const doRequest = async (token: string | null) => {
    let formData: FormData;
    if (arquivo instanceof FormData) {
      formData = arquivo;
    } else {
      formData = new FormData();
      formData.append(field, arquivo);
    }
    return fetch(url, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
  };

  let token = useAuthStore.getState().accessToken;
  let res = await doRequest(token);

  if (res.status === 401 && useAuthStore.getState().refreshToken) {
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
    token = await refreshPromise;
    if (token) res = await doRequest(token);
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    const erro = new ApiError(payload.message ?? res.statusText, res.status, payload.details);
    if (ehForaDoExpediente(erro)) encerrarPorHorario(erro.message);
    throw erro;
  }

  return res.json() as Promise<T>;
}
