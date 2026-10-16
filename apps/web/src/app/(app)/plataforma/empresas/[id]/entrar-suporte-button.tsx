"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CurrentUser } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { LifeBuoy } from "lucide-react";

interface LiberacaoSuporte {
  id: string;
  motivo: string;
  validoAte: string;
}

const hora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * "Entrar como suporte" — o ambiente do cliente, sem vínculo, enquanto a
 * liberação que ele deu (Administração > Liberação de Suporte) valer. Tudo o
 * que se faz lá vai para o log que o cliente lê.
 * Ver docs/planos/2026-10-16-entrar-como-suporte.md.
 */
export function EntrarSuporteButton({ empresaId }: { empresaId: string }) {
  const { setTokens, setUser } = useAuthStore();
  const [entrando, setEntrando] = useState(false);

  const { data: liberacao, isLoading } = useQuery({
    queryKey: ["plataforma-empresa-suporte", empresaId],
    queryFn: () =>
      apiFetch<LiberacaoSuporte | null>(`/plataforma/empresas/${empresaId}/suporte`),
  });

  const entrar = async () => {
    setEntrando(true);
    try {
      const tokens = await apiFetch<{ accessToken: string; refreshToken: string }>(
        `/auth/suporte/${empresaId}`,
        { method: "POST" },
      );
      setTokens(tokens.accessToken, tokens.refreshToken);
      setUser(await apiFetch<CurrentUser>("/auth/me"));
      // Recarrega a app inteira, como a troca de empresa: nada em cache da
      // empresa anterior fica na tela.
      window.location.assign("/");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao entrar como suporte");
      setEntrando(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        className="gap-2"
        disabled={isLoading || !liberacao || entrando}
        onClick={entrar}
      >
        <LifeBuoy className="size-4" />
        {entrando ? "Entrando…" : "Entrar como suporte"}
      </Button>
      <p className="text-xs text-muted-foreground">
        {isLoading
          ? "Conferindo a liberação…"
          : liberacao
            ? `Liberado pelo cliente até ${hora.format(new Date(liberacao.validoAte))}`
            : "O cliente não liberou o suporte (Administração > Liberação de Suporte)."}
      </p>
    </div>
  );
}
