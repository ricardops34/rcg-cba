"use client";

import { useQuery } from "@tanstack/react-query";
import type { CurrentUser } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { ChangePasswordForm } from "@/components/perfil/change-password-form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Gate global de troca de senha obrigatória (senha provisória ou expirada
 * pela política vigente). Reavalia `mustChangePassword` a cada carga/foco da
 * sessão via /auth/me (não só no momento do login), pra pegar uma expiração
 * que ocorra no meio de uma sessão longa. Enquanto aberto, o diálogo não pode
 * ser fechado por Esc/clique fora — só trocando a senha com sucesso.
 */
export function ForcedPasswordChangeGate() {
  const accessToken = useAuthStore((s) => s.accessToken);

  const { data } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiFetch<CurrentUser>("/auth/me"),
    enabled: !!accessToken,
  });

  const open = !!data?.mustChangePassword;

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Troca de senha obrigatória</DialogTitle>
          <DialogDescription>
            Sua senha expirou ou foi redefinida por um administrador. Troque-a para continuar.
          </DialogDescription>
        </DialogHeader>
        <ChangePasswordForm />
      </DialogContent>
    </Dialog>
  );
}
