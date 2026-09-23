"use client";

import { usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { ShieldAlert } from "lucide-react";

export function AvisoSuportePlataforma() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  // Exibe o aviso somente se for usuário admin da plataforma navegando fora do módulo /plataforma
  const isPlatformUser = user?.administradorPlataforma === true;
  const isTenantContext = !pathname.startsWith("/plataforma");

  if (!isPlatformUser || !isTenantContext) return null;

  return (
    <div className="bg-amber-500 text-amber-950 dark:bg-amber-900/90 dark:text-amber-100 text-xs px-4 py-1.5 font-medium flex items-center justify-center gap-2 border-b border-amber-600/30">
      <ShieldAlert className="w-4 h-4 shrink-0" />
      <span>
        <strong>Modo de Atendimento a Suporte:</strong> Suas ações neste ambiente de cliente dependem de liberação prévia do cliente e são auditadas em log.
      </span>
    </div>
  );
}
