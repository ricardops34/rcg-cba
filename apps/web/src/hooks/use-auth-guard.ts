"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

export function useAuthGuard() {
  const router = useRouter();
  const { accessToken, user, logout } = useAuthStore();

  useEffect(() => {
    // Login sem "Lembrar de mim": o marcador de sessão morre com o navegador,
    // então uma nova sessão com a flag efêmera ativa encerra o acesso.
    if (
      accessToken &&
      localStorage.getItem("plataforma-auth-ephemeral") === "1" &&
      !sessionStorage.getItem("plataforma-auth-session")
    ) {
      logout();
      return;
    }
    if (!accessToken) router.replace("/login");
  }, [accessToken, router, logout]);

  return { isReady: !!accessToken && !!user, user };
}
