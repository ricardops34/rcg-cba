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
  refreshToken: string | null;
  user: CurrentUser | null;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: CurrentUser) => void;
  logout: () => void;
  hasPermission: (rotinaCodigo: string, acao: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setUser: (user) => {
        lembrarEmpresaDoLogin(user);
        set({ user });
      },
      logout: () => {
        // Sem isto, a consulta em cache de QUALQUER tela (não só WhatsApp)
        // sobrevive ao logout — a navegação pro /login é do lado do
        // cliente, não recarrega a página — e aparece, por alguns segundos,
        // pro próximo usuário logado neste navegador. Visto em 2026-10-14:
        // instância de WhatsApp da BJSoftware na tela da RCG, depois de
        // trocar de login sem fechar o navegador.
        queryClient.clear();
        set({ accessToken: null, refreshToken: null, user: null });
      },
      hasPermission: (rotinaCodigo, acao) => {
        const user = get().user;
        if (!user) return false;
        return user.permissoes.includes(`${rotinaCodigo}.${acao}`);
      },
    }),
    { name: "plataforma-auth" },
  ),
);
