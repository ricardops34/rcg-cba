"use client";

import { useEffect } from "react";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

type Resumo = { data: string; texto: string };

/** Confirma no servidor somente depois de entregar a mensagem à janela. */
export function useResumoDiario(disponivel: boolean, apresentar: (texto: string) => void) {
  const usuarioId = useAuthStore((s) => s.user?.id);
  const empresaId = useAuthStore((s) => s.user?.empresaAtivaId);
  useEffect(() => {
    if (!disponivel || !usuarioId || !empresaId) return;
    let cancelado = false;
    let consultando = false;
    let consultadoEm = "";
    const mesmoContexto = () => {
      const user = useAuthStore.getState().user;
      return !cancelado && user?.id === usuarioId && user.empresaAtivaId === empresaId;
    };
    const consultar = async () => {
      if (document.visibilityState !== "visible" || consultando || !mesmoContexto()) return;
      const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Campo_Grande", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      if (consultadoEm === hoje) return;
      consultando = true;
      try {
        // O lock evita duas abas apresentarem simultaneamente o mesmo resumo.
        const carregar = async () => {
          if (!mesmoContexto()) return;
          const resumo = await apiFetch<Resumo | null>("/agente/resumo-diario");
          if (!mesmoContexto()) return;
          if (resumo) {
            apresentar(resumo.texto);
            consultadoEm = resumo.data;
            await apiFetch(`/agente/resumo-diario/${resumo.data}/exibido`, { method: "POST" });
          } else consultadoEm = hoje;
        };
        if (navigator.locks) await navigator.locks.request(`resumo-agente:${usuarioId}:${empresaId}`, carregar);
        else await carregar();
      } catch {
        // A indisponibilidade do resumo não impede o uso do restante da aplicação.
      } finally { consultando = false; }
    };
    void consultar();
    const aoRetornar = () => { void consultar(); };
    document.addEventListener("visibilitychange", aoRetornar);
    window.addEventListener("focus", aoRetornar);
    const intervalo = window.setInterval(aoRetornar, 60_000);
    return () => {
      cancelado = true;
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoRetornar);
      window.removeEventListener("focus", aoRetornar);
    };
  }, [disponivel, usuarioId, empresaId, apresentar]);
}
