"use client";

import type { ReactNode } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { ShieldAlert } from "lucide-react";

/**
 * Esconde as telas da plataforma de quem não administra o SaaS.
 *
 * **Não é controle de acesso** — é cortesia de navegação. Quem chegar aqui
 * digitando a URL vai receber 403 da API de qualquer forma, porque o corte de
 * verdade é o `PlatformAdminGuard` no servidor. Este componente existe para o
 * usuário ver uma explicação em vez de uma tabela vazia com erro.
 */
export function PlataformaGuard({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);

  // Enquanto a sessão carrega, não decide nada: mostrar a negativa e trocá-la
  // por conteúdo meio segundo depois pisca na cara de quem tem acesso.
  if (!user) return null;

  if (!user.administradorPlataforma) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <ShieldAlert className="size-10 text-muted-foreground" />
        <div>
          <p className="font-medium">Área restrita à administração da plataforma</p>
          <p className="text-sm text-muted-foreground">
            Seu usuário administra a empresa, não a plataforma. Se precisar de
            acesso, fale com quem administra o sistema.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
