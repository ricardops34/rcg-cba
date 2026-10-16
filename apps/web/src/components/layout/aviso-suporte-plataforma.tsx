"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { CurrentUser } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { ShieldAlert } from "lucide-react";

const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * Faixa da sessão de suporte ("Entrar como suporte", em Plataforma > Empresas):
 * de quem é o ambiente, até quando o cliente liberou e a saída. Aparece só
 * quando o `me()` traz `suporte` — antes dependia de "administrador da
 * plataforma numa empresa que não é a da plataforma", situação a que não se
 * chegava. Ver docs/planos/2026-10-16-entrar-como-suporte.md.
 */
export function AvisoSuportePlataforma() {
  const { user, setTokens, setUser } = useAuthStore();
  const [saindo, setSaindo] = useState(false);
  const suporte = user?.suporte;
  if (!user || !suporte) return null;

  // Volta para a empresa da plataforma (a conta tem vínculo com ela).
  const destino =
    user.empresas.find((e) => e.ePlataforma && e.empresaId !== suporte.empresaId) ??
    user.empresas.find((e) => e.empresaId !== suporte.empresaId);

  const sair = async () => {
    if (!destino) return;
    setSaindo(true);
    try {
      const tokens = await apiFetch<{ accessToken: string; refreshToken: string }>(
        "/auth/switch-empresa",
        { method: "POST", body: { empresaId: destino.empresaId } },
      );
      setTokens(tokens.accessToken, tokens.refreshToken);
      setUser(await apiFetch<CurrentUser>("/auth/me"));
      window.location.assign(`/plataforma/empresas/${suporte.empresaId}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao sair do ambiente do cliente");
      setSaindo(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-600/30 bg-amber-500 px-4 py-1.5 text-xs font-medium text-amber-950 dark:bg-amber-900/90 dark:text-amber-100">
      <ShieldAlert className="size-4 shrink-0" />
      <span>
        <strong>Suporte no ambiente de {suporte.nomeFantasia}</strong> — liberado pelo cliente até{" "}
        {hora.format(new Date(suporte.validoAte))}. Tudo o que você faz aqui fica no log que ele lê.
      </span>
      {destino && (
        <button
          type="button"
          onClick={sair}
          disabled={saindo}
          className="rounded border border-amber-950/40 px-2 py-0.5 font-semibold hover:bg-amber-950/10 disabled:opacity-60 dark:border-amber-100/40 dark:hover:bg-amber-100/10"
        >
          {saindo ? "Saindo…" : "Sair do ambiente do cliente"}
        </button>
      )}
    </div>
  );
}
