"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CurrentUser } from "@plataforma/contracts";
import { queryClient } from "@/app/providers";

// Alias da empresa ativa, guardado fora do estado da sessão: o logout limpa
// a sessão, e a tela de login ainda precisa saber de qual empresa o usuário
// saiu para já abrir com ela.
const ULTIMA_EMPRESA_KEY = "plataforma-ultima-empresa";

function lembrarEmpresaDoLogin(user: CurrentUser) {
  const alias = user.empresas.find((e) => e.empresaId === user.empresaAtivaId)?.alias;
  if (!alias) return;
  try {
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
