const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";
const STORAGE_KEY = "portal-cliente.session.v1";

export type Session = { accessToken: string; refreshToken: string; expiresIn: number };

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as Session | null;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveSession(session: Session | null) {
  if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(STORAGE_KEY);
}

async function parse<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>;
  const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(body?.message) ? body.message.join(". ") : body?.message;
  throw new Error(message ?? "Não foi possível concluir a operação.");
}

export function login(input: { empresaAlias: string; email: string; senha: string }) {
  return fetch(`${API_URL}/portal-cliente/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then(parse<Session>);
}

export function api<T>(path: string, init?: RequestInit) {
  const session = readSession();
  return fetch(`${API_URL}/portal-cliente${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.accessToken ?? ""}`,
      ...init?.headers,
    },
  }).then(parse<T>);
}
