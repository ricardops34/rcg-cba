import { useAuthStore } from "@/stores/auth-store";
import { reportarErroCliente } from "./erro-report";

export function resolveApiUrl(): string {
  if (typeof window !== "undefined") {
    const configured = process.env.NEXT_PUBLIC_API_URL;
    if (configured) {
      if (configured.startsWith("/")) {
        return `${window.location.origin}${configured.replace(/\/$/, "")}`;
      }
      return configured.replace(/\/$/, "");
    }
    return `${window.location.origin}/api/v1`;
  }
  return (
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://api:3001/api/v1"
  );
}

export function getApiOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  try {
    return new URL(resolveApiUrl()).origin;
  } catch {
    return "http://localhost:3001";
  }
}

/** Origem da API (sem o prefixo /api/v1), usada para servir assets como logos. */
export const API_ORIGIN =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:3001";

/** Monta a URL absoluta de um asset servido pela API (ex.: /uploads/logos/x.png). */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  // Avatares padrão pertencem ao `public` do Next, não ao volume de uploads
  // da API. Manter a URL relativa também evita diferença entre SSR e browser.
  if (path.startsWith("/avatares-padrao/")) return path;
  const origin = getApiOrigin();
  return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
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
 * Código que a API manda no 409 de `WhatsappConversasService.enviar()` quando
 * a janela de 24h da Cloud API expirou — só template pré-aprovado sai depois
 * disso, recusa da própria Meta. Composer usa isto para trocar o campo de
 * texto por um seletor de template em vez de mostrar um erro genérico.
 */
const CODIGO_WHATSAPP_JANELA_FECHADA = "WHATSAPP_JANELA_FECHADA";

export function ehJanelaWhatsappFechada(erro: unknown): boolean {
  return (
    erro instanceof ApiError &&
    erro.status === 409 &&
    (erro.details as { codigo?: string } | undefined)?.codigo ===
      CODIGO_WHATSAPP_JANELA_FECHADA
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

/**
 * Caminho em que a requisição nem chegou ao servidor: API fora, DNS, conexão
 * recusada, timeout. É o buraco que o log de erros existe para tapar — nada
 * disso aparece num log de servidor, porque o servidor não viu.
 *
 * Além de registrar, troca a mensagem: o "Failed to fetch" do navegador é
 * exatamente o texto inútil que motivou a ferramenta.
 */
function erroDeRede(
  erro: unknown,
  contexto: { rota: string; metodo?: string },
): ApiError {
  reportarErroCliente({
    tipo: "rede",
    rota: contexto.rota,
    metodo: contexto.metodo,
    pagina: typeof window !== "undefined" ? window.location.pathname : undefined,
    mensagem: erro instanceof Error ? erro.message : String(erro),
    stack: erro instanceof Error ? erro.stack : undefined,
  });
  return new ApiError(
    "Não foi possível falar com o servidor. Verifique a conexão e tente de novo.",
    // 0 = a requisição não recebeu resposta. Não é um status HTTP, e é assim
    // que a tela distingue "o servidor recusou" de "o servidor não respondeu".
    0,
  );
}

/** Respondeu, mas o corpo não era o combinado (HTML de proxy, JSON quebrado). */
function erroDeResposta(
  erro: unknown,
  contexto: { rota: string; metodo?: string; status: number },
): ApiError {
  reportarErroCliente({
    tipo: "resposta",
    rota: contexto.rota,
    metodo: contexto.metodo,
    status: contexto.status,
    pagina: typeof window !== "undefined" ? window.location.pathname : undefined,
    mensagem: erro instanceof Error ? erro.message : String(erro),
    stack: erro instanceof Error ? erro.stack : undefined,
  });
  return new ApiError(
    "O servidor respondeu em um formato inesperado.",
    contexto.status,
  );
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

  let res: Response;
  try {
    res = await fetch(`${resolveApiUrl()}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch (erro) {
    // API fora no meio de uma renovação. Registra e devolve null: quem chamou
    // segue com a resposta 401 que já tinha, em vez de estourar um
    // "Failed to fetch" cru no meio da tela.
    erroDeRede(erro, { rota: "/auth/refresh", metodo: "POST" });
    return null;
  }

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
    const meRes = await fetch(`${resolveApiUrl()}/auth/me`, {
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

  const url = new URL(`${resolveApiUrl()}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const doRequest = async (token: string | null) => {
    try {
      return await fetch(url.toString(), {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (erro) {
      throw erroDeRede(erro, { rota: url.pathname, metodo: method });
    }
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
  try {
    return (await res.json()) as T;
  } catch (erro) {
    throw erroDeResposta(erro, {
      rota: url.pathname,
      metodo: method,
      status: res.status,
    });
  }
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
  const url = `${resolveApiUrl()}${path}`;

  const doRequest = async (token: string | null) => {
    let formData: FormData;
    if (arquivo instanceof FormData) {
      formData = arquivo;
    } else {
      formData = new FormData();
      formData.append(field, arquivo);
    }
    try {
      return await fetch(url, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
    } catch (erro) {
      throw erroDeRede(erro, { rota: path, metodo: "POST" });
    }
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

/**
 * Baixa um arquivo gerado pela API (hoje a proposta de orçamento em PDF) e
 * dispara o download no navegador.
 *
 * Não dá para usar um `<a href>` simples: a rota exige o Bearer token, que só
 * existe aqui — daí buscar como blob, com o mesmo refresh e o mesmo tratamento
 * de erro do `apiFetch`. O nome do arquivo vem do Content-Disposition, com o
 * `nomePadrao` como reserva.
 */
export async function apiDownload(path: string, nomePadrao: string): Promise<void> {
  const url = `${resolveApiUrl()}${path}`;

  const doRequest = async (token: string | null) => {
    try {
      return await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch (erro) {
      throw erroDeRede(erro, { rota: path, metodo: "GET" });
    }
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
    // O corpo do erro continua sendo JSON (filtro de exceção do Nest), mesmo
    // com a rota produzindo PDF no caminho feliz.
    const payload = await res.json().catch(() => ({}));
    const erro = new ApiError(payload.message ?? res.statusText, res.status, payload.details);
    if (ehForaDoExpediente(erro)) encerrarPorHorario(erro.message);
    throw erro;
  }

  const disposition = res.headers.get("Content-Disposition") ?? "";
  const nome = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? nomePadrao;

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Revogar na hora cancelaria o download em alguns navegadores.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  }
}

/**
 * Consome uma rota `text/event-stream`, entregando cada evento assim que chega.
 *
 * Não dá para usar `EventSource`: ele só faz GET e não deixa mandar cabeçalho,
 * e toda rota daqui exige o Bearer token. Daí `fetch` + leitura do corpo, com
 * o mesmo refresh de 401 e o mesmo tratamento de erro do `apiFetch` — quem
 * chama não deveria precisar saber que o transporte é outro.
 *
 * Só o cabeçalho e a falha de rede viram exceção. Depois do primeiro byte o
 * servidor não tem mais status HTTP para dar, então o que dá errado no meio do
 * turno chega como evento (ver `mensagemDeErro`, na API) — e quem consome
 * decide o que fazer com ele.
 */
export async function apiStream<T>(
  path: string,
  body: unknown,
  onEvento: (evento: T) => void,
): Promise<void> {
  const url = `${resolveApiUrl()}${path}`;

  const doRequest = async (token: string | null) => {
    try {
      return await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch (erro) {
      throw erroDeRede(erro, { rota: path, metodo: "POST" });
    }
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
    // Recusa antes do stream começar: o corpo ainda é o JSON de erro do Nest.
    const payload = await res.json().catch(() => ({}));
    const erro = new ApiError(payload.message ?? res.statusText, res.status, payload.details);
    if (ehForaDoExpediente(erro)) encerrarPorHorario(erro.message);
    throw erro;
  }

  if (!res.body) {
    throw new ApiError("O servidor não devolveu um stream.", res.status);
  }

  const leitor = res.body.getReader();
  const decoder = new TextDecoder();
  // Um chunk da rede não respeita a fronteira do evento: pode trazer meio
  // JSON. O que sobra fica aqui até o "\n\n" que fecha o evento chegar.
  let restante = "";

  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    restante += decoder.decode(value, { stream: true });

    const blocos = restante.split("\n\n");
    restante = blocos.pop() ?? "";

    for (const bloco of blocos) {
      const linha = bloco.split("\n").find((l) => l.startsWith("data: "));
      if (!linha) continue;
      try {
        onEvento(JSON.parse(linha.slice(6)) as T);
      } catch {
        // Evento ilegível não derruba os outros: o turno continua, e o
        // "fim" que interessa provavelmente ainda vem.
      }
    }
  }
}
