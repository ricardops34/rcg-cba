"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { UserCog } from "lucide-react";

/**
 * "Testar como este usuário" — abre uma aba nova, autenticada com o perfil do
 * usuário alvo (token de 15 min, sem senha dele), sem derrubar a sessão real
 * dele se ele estiver logado. Recusado pelo backend (ForbiddenException) para
 * perfil de administração ou o próprio usuário logado — a mensagem de erro
 * do servidor é exibida como veio.
 *
 * Abre em aba nova de propósito: o token entra no `sessionStorage` dessa aba
 * (ver `ativarArmazenamentoDaAba` em stores/auth-store.ts), não no
 * `localStorage` — a sessão desta aba some ao fechá-la, e a sua sessão de
 * administrador, nas outras abas, não é tocada.
 */
export function UsuarioPersonificarSection({
  usuarioId,
  usuarioNome,
}: {
  usuarioId: string;
  usuarioNome: string;
}) {
  const currentUser = useAuthStore((s) => s.user);
  const [entrando, setEntrando] = useState(false);

  if (currentUser?.id === usuarioId) return null;

  const entrar = async () => {
    setEntrando(true);
    try {
      const { accessToken } = await apiFetch<{ accessToken: string }>(
        `/usuarios/${usuarioId}/personificar`,
        { method: "POST" },
      );
      const destino = `${window.location.origin}/personificar/entrar?token=${encodeURIComponent(accessToken)}`;
      window.open(destino, "_blank", "noopener");
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Erro ao abrir o acesso como este usuário",
      );
    } finally {
      setEntrando(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="space-y-0.5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <UserCog className="size-4" />
          Testar como este usuário
        </p>
        <p className="text-xs text-muted-foreground">
          Abre uma aba nova logado como {usuarioNome}, com o perfil dele, por 15 minutos —
          sem senha e sem afetar a sessão dele caso esteja logado. Toda ação fica registrada
          no log de auditoria.
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={entrar} disabled={entrando}>
        {entrando ? "Abrindo…" : "Testar como"}
      </Button>
    </div>
  );
}
