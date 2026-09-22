"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LayoutDashboard } from "lucide-react";
import { useMenu, type MenuItem } from "@/hooks/use-menu";
import { useAuthStore } from "@/stores/auth-store";
import { DynamicIcon } from "@/lib/dynamic-icon";
import { avatarColorClass, initials } from "@/lib/avatar-color";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { assetUrl } from "@/lib/api-client";

export function AppSidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      data-tour="menu-lateral"
      className={cn(
        "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
        collapsed ? "w-[4.5rem]" : "w-64",
      )}
    >
      <SidebarContent collapsed={collapsed} />
    </aside>
  );
}

export function MobileSidebar({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-72 flex-col bg-sidebar p-0 text-sidebar-foreground"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <SidebarContent
          collapsed={false}
          onNavigate={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

/**
 * Poda o menu para o celular: cai o que foi marcado como "somente tela maior",
 * e o grupo que ficar sem nenhum filho cai junto.
 */
function noCelular(menu: MenuItem): MenuItem | null {
  if (!menu.disponivelTelaPequena) return null;
  const submenus = (menu.submenus ?? [])
    .map(noCelular)
    .filter((sub): sub is MenuItem => sub !== null);
  const temRotina = menu.rotinas.some((rotina) => rotina.disponivelTelaPequena);
  if (!temRotina && submenus.length === 0) return null;
  return { ...menu, submenus };
}

function SidebarContent({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { data: modulos, isLoading } = useMenu();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const empresaAtiva = user?.empresas.find(
    (empresa) => empresa.empresaId === user.empresaAtivaId,
  );
  const logo = assetUrl(empresaAtiva?.logoUrl);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const modulosVisiveis = modulos
    ?.map((modulo) => ({
      ...modulo,
      menus: onNavigate
        ? modulo.disponivelTelaPequena
          ? modulo.menus
              .map(noCelular)
              .filter((menu): menu is MenuItem => menu !== null)
          : []
        : modulo.menus,
    }))
    .filter((modulo) => modulo.menus.length > 0);

  const toggleGroup = (id: string) =>
    setClosedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  return (
    <>
      {/* Recolhida a barra tem 4.5rem: com px-3 sobrariam 48px e a logo (52.8px)
          encostaria nas bordas — por isso o respiro menor só nesse estado. */}
      <div
        className={cn(
          "flex h-16 shrink-0 items-center justify-center",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {logo ? (
          /*
            Altura **fixa**, não `max-h`: com um teto, a logo cujo arquivo é
            menor que ele fica no tamanho natural, e duas empresas apareciam
            em tamanhos diferentes na mesma barra. Assim toda logo é escalada
            para a mesma caixa, e `object-contain` cuida da proporção.
          */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={empresaAtiva?.nomeFantasia ?? "Empresa ativa"}
            className={cn(
              "h-[3.3rem] w-full object-contain",
              collapsed ? "max-w-[3.3rem]" : "max-w-[216px]",
            )}
          />
        ) : (
          <span
            className={cn(
              "truncate text-center font-semibold",
              collapsed ? "text-xs" : "text-sm",
            )}
          >
            {collapsed
              ? empresaAtiva?.nomeFantasia.slice(0, 2).toUpperCase()
              : (empresaAtiva?.nomeFantasia ?? "Plataforma Comercial")}
          </span>
        )}
      </div>

      <nav
        className={cn(
          "flex-1 space-y-5 overflow-y-auto px-3 pt-4 pb-4",
          collapsed && "px-2",
        )}
      >
        <NavLink
          href="/"
          icon={<LayoutDashboard className="size-4" />}
          label="Dashboard"
          active={pathname === "/"}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />

        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-md" />
          ))}

        {modulosVisiveis?.map((modulo) =>
          collapsed ? (
            <DropdownMenu key={modulo.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-center rounded-md py-2 text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
                        modulo.menus.some((menu) => menu.rota === pathname) &&
                          "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
                      )}
                    >
                      <DynamicIcon name={modulo.icone} className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="right">{modulo.nome}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent
                side="right"
                align="start"
                className="min-w-48"
              >
                <DropdownMenuLabel>{modulo.nome}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {modulo.menus.flatMap((menu) =>
                  // Submenu entra na mesma lista, recuado: um menu dentro de
                  // outro não caberia na barra recolhida.
                  [{ menu, nivel: 0 }, ...(menu.submenus ?? []).map((sub) => ({ menu: sub, nivel: 1 }))].map(
                    ({ menu: item, nivel }) => (
                      <DropdownMenuItem key={item.id} asChild>
                        <Link
                          href={item.rota ?? "#"}
                          className={cn(
                            "flex items-center gap-2",
                            nivel > 0 && "pl-7",
                            pathname === item.rota &&
                              "bg-accent text-accent-foreground",
                          )}
                        >
                          <DynamicIcon name={item.icone} className="size-4" />
                          <span>{item.nome}</span>
                        </Link>
                      </DropdownMenuItem>
                    ),
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Collapsible
              key={modulo.id}
              open={!closedGroups.has(modulo.id)}
              onOpenChange={() => toggleGroup(modulo.id)}
            >
              <CollapsibleTrigger className="group flex w-full items-center justify-between px-3 py-1 text-left">
                <span className="font-mono text-[0.68rem] font-medium tracking-widest text-sidebar-foreground/50 uppercase">
                  {modulo.nome}
                </span>
                <ChevronDown className="size-3.5 text-sidebar-foreground/40 transition-transform group-data-[state=closed]:-rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-0.5 pt-1">
                {modulo.menus.map((menu) => (
                  <div key={menu.id} className="space-y-0.5">
                    <NavLink
                      href={menu.rota ?? "#"}
                      icon={<DynamicIcon name={menu.icone} className="size-4" />}
                      label={menu.nome}
                      active={pathname === menu.rota}
                      collapsed={collapsed}
                      onNavigate={onNavigate}
                    />
                    {(menu.submenus ?? []).map((submenu) => (
                      <NavLink
                        key={submenu.id}
                        href={submenu.rota ?? "#"}
                        icon={<DynamicIcon name={submenu.icone} className="size-4" />}
                        label={submenu.nome}
                        active={pathname === submenu.rota}
                        collapsed={collapsed}
                        onNavigate={onNavigate}
                        nivel={1}
                      />
                    ))}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          ),
        )}
      </nav>

      {user && (
        <div
          className={cn(
            "shrink-0 border-t border-sidebar-border p-3",
            collapsed && "flex justify-center px-2",
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2.5",
              collapsed && "justify-center",
            )}
          >
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                avatarColorClass(user.nome),
              )}
            >
              {initials(user.nome)}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.nome}</p>
                <p className="truncate text-xs text-sidebar-foreground/50">
                  {user.email}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function NavLink({
  href,
  icon,
  label,
  active,
  collapsed,
  onNavigate,
  nivel = 0,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
  /** 1 = submenu: recuado, para o agrupamento ficar visível. */
  nivel?: number;
}) {
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        nivel > 0 && !collapsed && "ml-3 border-l border-sidebar-border pl-4 text-sidebar-foreground/70",
        collapsed && "justify-center px-0",
        active &&
          "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
      )}
    >
      {icon}
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
