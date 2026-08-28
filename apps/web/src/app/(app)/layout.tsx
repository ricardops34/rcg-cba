"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppSidebar, MobileSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { ForcedPasswordChangeGate } from "@/components/auth/forced-password-change-gate";
import { AgenteFab } from "@/components/agente/agente-fab";
import { ResponsiveRouteGuard } from "@/components/layout/responsive-route-guard";
import { FaixaInstitucional } from "@/components/layout/faixa-institucional";

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Dashboard", subtitle: "Visão comercial" },
  "/admin/empresas": { title: "Empresas", subtitle: "Cadastro base" },
  "/admin/usuarios": { title: "Usuários", subtitle: "Cadastro e permissões" },
  "/admin/perfis": { title: "Perfis", subtitle: "Papéis e permissões (RBAC)" },
  "/admin/estrutura": { title: "Estrutura de menu", subtitle: "Módulos, menus e rotinas" },
  "/admin/clientes-config": {
    title: "Campos do Cliente",
    subtitle: "Defina quais campos podem ser alterados",
  },
  "/admin/acessos": {
    title: "Acessos",
    subtitle: "Entradas, tempo de uso e tentativas sem sucesso",
  },
  "/cadastros/clientes-alteracoes": {
    title: "Alterações de Cliente",
    subtitle: "Aprove ou recuse mudanças no cadastro",
  },
  "/admin/agente": {
    title: "Agente IA",
    subtitle: "Chave de API, personalidade e ajustes do assistente",
  },
  "/consultas/sugestao-compra": {
    title: "Sugestão de Compra",
    subtitle: "O que clientes parecidos compram e este ainda não",
  },
  "/perfil": { title: "Meu perfil", subtitle: "Dados da conta" },
  "/comercial/produtos": { title: "Produtos", subtitle: "Catálogo de produtos" },
};

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const { isReady } = useAuthGuard();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!isReady) {
    return <div className="flex min-h-svh items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  const page = PAGE_TITLES[pathname];
  const handleToggleSidebar = () => {
    if (isMobile) setMobileOpen((open) => !open);
    else setCollapsed((c) => !c);
  };

  return (
    <div className="flex min-h-svh flex-col">
      <ForcedPasswordChangeGate />
      <FaixaInstitucional />

      <div className="flex min-h-0 flex-1">
        <AppSidebar collapsed={collapsed} />
        <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbar onToggleSidebar={handleToggleSidebar} title={page?.title} subtitle={page?.subtitle} />
          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/30 p-3 sm:p-4 lg:p-6">
            <ResponsiveRouteGuard>{children}</ResponsiveRouteGuard>
          </main>
        </div>
      </div>

      {/* Montado uma vez no shell: fica disponível em toda tela do app e não
          existe no login. */}
      <AgenteFab />
    </div>
  );
}
