"use client";

import { useState } from "react";
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
  "/comercial/colaboradores": { title: "Colaboradores", subtitle: "Vendedores e hierarquia" },
};

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const { isReady } = useAuthGuard();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  if (!isReady) {
    return <div className="flex min-h-svh items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  const page = PAGE_TITLES[pathname];

  return (
    <div className="flex min-h-svh">
      <AppSidebar collapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar onToggleSidebar={() => setCollapsed((c) => !c)} title={page?.title} subtitle={page?.subtitle} />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
      </div>
    </div>
  );
}
