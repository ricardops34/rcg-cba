"use client";

import { useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Dashboard", subtitle: "Visão comercial" },
  "/admin/empresas": { title: "Empresas", subtitle: "Cadastro base" },
  "/admin/usuarios": { title: "Usuários", subtitle: "Cadastro e permissões" },
  "/admin/perfis": { title: "Perfis", subtitle: "Papéis e permissões (RBAC)" },
  "/admin/estrutura": { title: "Estrutura de menu", subtitle: "Módulos, menus e rotinas" },
  "/comercial/clientes": { title: "Clientes", subtitle: "Carteira comercial" },
  "/comercial/notas-saida": { title: "Notas Fiscais de Saída", subtitle: "Faturamento por vendedor" },
  "/comercial/produtos": { title: "Produtos", subtitle: "Catálogo de produtos" },
  "/comercial/titulos-receber": { title: "Títulos a Receber", subtitle: "Contas a receber por vendedor" },
  "/comercial/posicao-clientes": { title: "Posição de Clientes", subtitle: "Indicadores e histórico por cliente" },
};

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const { isReady } = useAuthGuard();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);

  if (!isReady) {
    return <div className="flex min-h-svh items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  const page = PAGE_TITLES[pathname];

  return (
    <div className="flex min-h-svh flex-col">
      {/* Faixa magenta da marca allia — full-width no topo da tela */}
      <div className="flex h-10 shrink-0 items-center justify-center bg-[#bd1e7d]">
        <Image
          src="/allia.png"
          alt="allia — Empresa associada"
          width={208}
          height={38}
          priority
          className="h-6 w-auto brightness-0 invert"
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <AppSidebar collapsed={collapsed} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbar onToggleSidebar={() => setCollapsed((c) => !c)} title={page?.title} subtitle={page?.subtitle} />
          <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
