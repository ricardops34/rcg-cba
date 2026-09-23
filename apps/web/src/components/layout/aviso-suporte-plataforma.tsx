"use client";

import { usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { ShieldAlert } from "lucide-react";

export function AvisoSuportePlataforma() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  const empresaAtiva = user?.empresas.find((e) => e.empresaId === user.empresaAtivaId);

  // O aviso de modo de suporte só é exibido se o usuário for admin da plataforma
  // e estiver navegando no ambiente de uma empresa cliente (onde ePlataforma !== true)
  const isPlatformUser = user?.administradorPlataforma === true;
  const isCustomerTenant = empresaAtiva?.ePlataforma !== true;
  const isOutsidePlatformModule = !pathname.startsWith("/plataforma");

  if (!isPlatformUser || !isCustomerTenant || !isOutsidePlatformModule) return null;

  return (
    <div className="bg-amber-500 text-amber-950 dark:bg-amber-900/90 dark:text-amber-100 text-xs px-4 py-1.5 font-medium flex items-center justify-center gap-2 border-b border-amber-600/30">
      <ShieldAlert className="w-4 h-4 shrink-0" />
      <span>
        <strong>Modo de Atendimento a Suporte:</strong> Suas ações neste ambiente de cliente dependem de liberação prévia do cliente e são auditadas em log.
      </span>
    </div>
  );
}
