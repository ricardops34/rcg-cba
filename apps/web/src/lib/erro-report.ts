import type { ErroClienteItem } from "@plataforma/contracts";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Captura no navegador do que a API nunca soube (ver
 * `docs/planos/log-de-erros.md`).
 *
 * A dobra que justifica o buffer: quando a causa é "a API está fora", o
 * próprio report falha. Reportar direto registraria tudo **menos** a queda —
 * que é exatamente o incidente que motivou a ferramenta. Por isso o erro
 * primeiro vai para o `localStorage` e só depois tenta sair; o que não
 * conseguir sair fica lá, inclusive entre recarregamentos da página.
 */

const CHAVE = "plataforma-erros-pendentes";

/** O envio aceita 50 por vez; o buffer guarda o mesmo tanto. */
const MAX_PENDENTES = 50;

/** Espera antes de tentar enviar, para uma rajada sair num lote só. */
const DEBOUNCE_MS = 3_000;

/** Depois de uma tentativa de envio frustrada, espera isto antes da próxima. */
const BACKOFF_MS = 30_000;

/** Erro idêntico repetido dentro desta janela não entra de novo no buffer. */
const JANELA_REPETICAO_MS = 60_000;

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

let timer: ReturnType<typeof setTimeout> | null = null;
let bloqueadoAte = 0;
let enviando = false;
const ultimaVez = new Map<string, number>();

function lerPendentes(): ErroClienteItem[] {
  if (typeof window === "undefined") return [];
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    // localStorage indisponível (modo restrito) ou conteúdo corrompido: o log
    // de erros não pode ser a causa de mais um erro.
    return [];
  }
}

function gravarPendentes(lista: ErroClienteItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(lista.slice(-MAX_PENDENTES)));
  } catch {
    /* cota estourada ou storage bloqueado — não há o que fazer aqui */
  }
}

/**
 * Registra um erro visto pelo navegador.
 *
 * Nunca lança e nunca espera: é chamada de dentro do tratamento de outro erro,
 * e uma falha aqui esconderia o problema original.
 */
export function reportarErroCliente(
  erro: Omit<ErroClienteItem, "ocorridoEm"> & { ocorridoEm?: string },
): void {
  try {
    if (typeof window === "undefined") return;

    // Repetição em rajada (um componente em laço de render) encheria o buffer
    // com a mesma linha e empurraria os erros diferentes para fora.
    const chave = `${erro.tipo}|${erro.metodo ?? ""}|${erro.rota}|${erro.mensagem}`;
    const agora = Date.now();
    const anterior = ultimaVez.get(chave);
    if (anterior && agora - anterior < JANELA_REPETICAO_MS) return;
    if (ultimaVez.size > 200) ultimaVez.clear();
    ultimaVez.set(chave, agora);

    const item: ErroClienteItem = {
      ...erro,
      ocorridoEm: erro.ocorridoEm ?? new Date().toISOString(),
    };
    gravarPendentes([...lerPendentes(), item]);
    agendarEnvio();
  } catch {
    /* nunca deixa o report derrubar quem o chamou */
  }
}

function agendarEnvio() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void enviarPendentes();
  }, DEBOUNCE_MS);
}

/**
 * Descarrega o buffer. Usa `fetch` cru de propósito: passar pelo `apiFetch`
 * faria o erro do report virar mais um erro reportado, em laço.
 */
export async function enviarPendentes(): Promise<void> {
  if (typeof window === "undefined") return;
  if (enviando || Date.now() < bloqueadoAte) return;

  const pendentes = lerPendentes();
  if (pendentes.length === 0) return;

  // Sem sessão não há para quem atribuir o erro, e a rota exige login. Os
  // pendentes ficam guardados e saem depois do próximo login — inclusive os
  // que aconteceram antes dele.
  const token = useAuthStore.getState().accessToken;
  if (!token) return;

  enviando = true;
  try {
    const res = await fetch(`${API_URL}/erros/cliente`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ erros: pendentes.slice(0, MAX_PENDENTES) }),
    });

    if (res.ok) {
      // Só o que foi enviado sai da fila: o que chegou durante o envio fica.
      const restantes = lerPendentes().slice(pendentes.length);
      gravarPendentes(restantes);
      if (restantes.length > 0) agendarEnvio();
      return;
    }

    // 401 é sessão expirada; 400 é payload que esta versão do cliente não
    // sabe montar. Nos dois casos insistir não resolve e o buffer cresceria
    // para sempre — descarta, porque um log que trava o navegador é pior que
    // um log incompleto.
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      gravarPendentes(lerPendentes().slice(pendentes.length));
      return;
    }
    bloqueadoAte = Date.now() + BACKOFF_MS;
  } catch {
    // A API continua fora — é o caso normal aqui, não uma exceção. Mantém os
    // pendentes e tenta de novo mais tarde.
    bloqueadoAte = Date.now() + BACKOFF_MS;
  } finally {
    enviando = false;
  }
}

let instalado = false;

/**
 * Liga a captura global. Chamada uma vez, do provider da aplicação.
 *
 * Cobre o que não passa por `apiFetch`: erro de JavaScript na tela e promessa
 * rejeitada sem tratamento. As falhas de rede e de resposta são reportadas
 * pelo próprio `api-client`, que é quem as vê.
 */
export function instalarCapturaDeErros(): () => void {
  if (typeof window === "undefined" || instalado) return () => undefined;
  instalado = true;

  const onErro = (evento: ErrorEvent) => {
    reportarErroCliente({
      tipo: "javascript",
      rota: evento.filename || window.location.pathname,
      pagina: window.location.pathname,
      mensagem: evento.message || "Erro de JavaScript",
      stack: evento.error instanceof Error ? evento.error.stack : undefined,
    });
  };

  const onPromessa = (evento: PromiseRejectionEvent) => {
    const motivo = evento.reason;
    reportarErroCliente({
      tipo: "promessa",
      rota: window.location.pathname,
      pagina: window.location.pathname,
      mensagem:
        motivo instanceof Error
          ? motivo.message
          : String(motivo ?? "Promessa rejeitada"),
      stack: motivo instanceof Error ? motivo.stack : undefined,
    });
  };

  // A conexão voltando é o momento exato de descarregar o que ficou preso.
  const onOnline = () => {
    bloqueadoAte = 0;
    void enviarPendentes();
  };

  window.addEventListener("error", onErro);
  window.addEventListener("unhandledrejection", onPromessa);
  window.addEventListener("online", onOnline);

  // O que sobrou da sessão anterior (aba fechada com a API fora) sai agora.
  void enviarPendentes();

  return () => {
    window.removeEventListener("error", onErro);
    window.removeEventListener("unhandledrejection", onPromessa);
    window.removeEventListener("online", onOnline);
    instalado = false;
  };
}
