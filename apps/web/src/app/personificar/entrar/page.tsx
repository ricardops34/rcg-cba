"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CurrentUser } from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { ativarArmazenamentoDaAba, useAuthStore } from "@/stores/auth-store";
import { Loader2 } from "lucide-react";

/**
 * Entrada da aba de personificação ("Testar como este usuário"). Recebe o
 * token de 15 min pela URL (aberto por UsuarioPersonificarSection, numa aba
 * nova) e grava a sessão **só no sessionStorage desta aba**
 * (`ativarArmazenamentoDaAba`, chamada antes de qualquer `setTokens`/`setUser`)
 * — assim ela não sobrescreve, em `localStorage`, a sessão do administrador
 * nas outras abas do mesmo navegador.
 */
function EntrarComoPersonificacao() {
  const router = useRouter();
  const params = useSearchParams();
  const { setTokens, setUser } = useAuthStore();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setErro("Link inválido: token ausente.");
      return;
    }
    (async () => {
      try {
        ativarArmazenamentoDaAba();
        setTokens(token);
        setUser(await apiFetch<CurrentUser>("/auth/me"));
        router.replace("/");
      } catch (err) {
        setErro(
          err instanceof ApiError
            ? err.message
            : "Não foi possível entrar com este token — ele pode ter expirado (vale 15 min).",
        );
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      {erro ? (
        <p className="max-w-sm text-sm text-destructive">{erro}</p>
      ) : (
        <>
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Entrando…</p>
        </>
      )}
    </div>
  );
}

export default function PersonificarEntrarPage() {
  return (
    <Suspense fallback={null}>
      <EntrarComoPersonificacao />
    </Suspense>
  );
}
