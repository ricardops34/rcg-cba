"use client";

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { CurrentUser } from "@plataforma/contracts";
import { queryClient } from "@/app/providers";

// Alias da empresa ativa, guardado fora do estado da sessão: o logout limpa
// a sessão, e a tela de login ainda precisa saber de qual empresa o usuário
// saiu para já abrir com ela.
const ULTIMA_EMPRESA_KEY = "plataforma-ultima-empresa";

/**
 * Liga/desliga, só nesta aba, o armazenamento em `sessionStorage` em vez de
 * `localStorage` para o estado de autenticação. Ligada por
 * `/personificar/entrar` (ver o componente), antes de gravar o token
 * personificado: sem isso, `localStorage` é compartilhado entre abas do
 * mesmo navegador e o token do usuário personificado sobrescreveria a sessão
 * real do administrador em todas as abas dele, não só nesta.
 */
const FLAG_PERSONIFICACAO = "plataforma-personificacao-ativa";

export function ativarArmazenamentoDaAba() {
  try {
    sessionStorage.setItem(FLAG_PERSONIFICACAO, "1");
    // `useAuthGuard` desloga (chamando `logout()`, que usa o cookie do
    // navegador) quando o login do admin foi "efêmero" e esta aba não tem o
    // marcador `plataforma-auth-session` — marcador que só a tela de login
    // grava. Esta aba nunca passa pelo login, então precisa gravá-lo também,
    // senão o guard derrubaria a sessão REAL do administrador ao montar
    // (mesmo cookie HttpOnly em todas as abas do navegador).
    sessionStorage.setItem("plataforma-auth-session", "1");
  } catch {
    // Sem sessionStorage, a personificação segue funcionando nesta carga de
    // página — só não sobrevive a um F5 isolada do resto do navegador.
  }
}

/** `getItem`/`setItem`/`removeItem` resolvidos a cada chamada, não na importação do módulo. */
const storageDaAba: StateStorage = {
  getItem: (name) => {
    try {
      const personificando = sessionStorage.getItem(FLAG_PERSONIFICACAO);
      return (personificando ? sessionStorage : localStorage).getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      const personificando = sessionStorage.getItem(FLAG_PERSONIFICACAO);
      (personificando ? sessionStorage : localStorage).setItem(name, value);
    } catch {
      // Sem armazenamento, a sessão só não sobrevive a um F5.
    }
  },
  removeItem: (name) => {
    try {
      const personificando = sessionStorage.getItem(FLAG_PERSONIFICACAO);
      (personificando ? sessionStorage : localStorage).removeItem(name);
    } catch {
      // idem
    }
  },
};

function lembrarEmpresaDoLogin(user: CurrentUser) {
  const alias = user.empresas.find((e) => e.empresaId === user.empresaAtivaId)?.alias;
  if (!alias) return;
  try {
    // Sempre no localStorage real (não pela storageDaAba): é um atalho da
    // tela de login, de propósito fora do estado isolado da personificação —
    // uma aba de "Testar como este usuário" não deve trocar o que fica
    // pré-preenchido no login de quem usa este navegador depois.
    if (sessionStorage.getItem(FLAG_PERSONIFICACAO)) return;
    localStorage.setItem(ULTIMA_EMPRESA_KEY, alias);
  } catch {
    // Sem armazenamento, o login só abre sem a empresa preenchida.
  }
}

export function ultimaEmpresaDoLogin(): string {
  try {
    return localStorage.getItem(ULTIMA_EMPRESA_KEY) ?? "";
  } catch {
    return "";
  }
}

interface AuthState {
  accessToken: string | null;
  user: CurrentUser | null;
  setTokens: (accessToken: string) => void;
  setUser: (user: CurrentUser) => void;
  logout: () => void;
  /**
   * Fecha a sessão desta aba sem chamar `/auth/logout`: a personificação não
   * tem refresh token próprio, e o cookie HttpOnly é do navegador — chamar
   * logout aqui encerraria a sessão real do administrador se o cookie dele
   * estiver presente (mesmo navegador). Só limpa o estado local da aba.
   */
  encerrarAba: () => void;
  hasPermission: (rotinaCodigo: string, acao: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,
      // O refresh token NÃO fica aqui: vive num cookie HttpOnly que o servidor
      // grava e o navegador envia sozinho (SEC-11) — script da página não o lê.
      setTokens: (accessToken) => set({ accessToken }),
      setUser: (user) => {
        lembrarEmpresaDoLogin(user);
        set({ user });
      },
      encerrarAba: () => {
        queryClient.clear();
        set({ accessToken: null, user: null });
      },
      logout: () => {
        // Sem isto, a consulta em cache de QUALQUER tela (não só WhatsApp)
        // sobrevive ao logout — a navegação pro /login é do lado do
        // cliente, não recarrega a página — e aparece, por alguns segundos,
        // pro próximo usuário logado neste navegador. Visto em 2026-10-14:
        // instância de WhatsApp de uma empresa na tela de outra, depois de
        // trocar de login sem fechar o navegador.
        queryClient.clear();
        // Encerra a sessão no servidor e apaga o cookie do refresh token. Sem
        // esperar: a saída da tela não depende da resposta, e falha de rede
        // aqui não pode prender o usuário logado.
        void fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "/api/v1"}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          credentials: "include",
        }).catch(() => undefined);
        set({ accessToken: null, user: null });
      },
      hasPermission: (rotinaCodigo, acao) => {
        const user = get().user;
        if (!user) return false;
        return user.permissoes.includes(`${rotinaCodigo}.${acao}`);
      },
    }),
    {
      name: "plataforma-auth",
      storage: createJSONStorage(() => storageDaAba),
      // v1: o refresh token saiu do armazenamento do navegador. Quem tinha o
      // formato antigo perde o token guardado (precisa entrar de novo uma vez)
      // e o valor antigo sai do localStorage.
      version: 1,
      migrate: (guardado) => {
        const { refreshToken: _antigo, ...resto } = (guardado ?? {}) as Record<string, unknown>;
        return resto as unknown as AuthState;
      },
    },
  ),
);
