"use client";

import { useEffect } from "react";
import { toast } from "sonner";
// Importado aqui, no layout raiz, para o ouvinte de `beforeinstallprompt`
// existir desde a primeira tela — o evento dispara uma vez só.
import "@/lib/app-celular";

/** De quanto em quanto tempo o app aberto pergunta se houve deploy. */
const INTERVALO_VERSAO_MS = 10 * 60_000;

/**
 * Registra o service worker (só em produção) e avisa quando há versão nova.
 *
 * O app instalado fica aberto por dias: sem o aviso, o vendedor seguiria com
 * as telas do build antigo conversando com a API nova. A checagem roda ao
 * voltar para o app e de tempos em tempos; o toque em "Atualizar" recarrega.
 */
export function PwaRegistro() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }

    const atual = process.env.NEXT_PUBLIC_VERSAO;
    if (!atual) return;
    let avisado = false;

    const conferir = async () => {
      if (avisado || document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/versao", { cache: "no-store" });
        if (!r.ok) return;
        const { versao } = (await r.json()) as { versao: string | null };
        if (!versao || versao === atual) return;
        avisado = true;
        toast("Nova versão do sistema disponível.", {
          duration: Infinity,
          action: { label: "Atualizar", onClick: () => window.location.reload() },
        });
      } catch {
        // Sem rede: a próxima checagem tenta de novo.
      }
    };

    const timer = window.setInterval(() => void conferir(), INTERVALO_VERSAO_MS);
    const aoVoltar = () => void conferir();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);
  return null;
}
