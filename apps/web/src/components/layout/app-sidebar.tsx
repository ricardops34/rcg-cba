"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LayoutDashboard } from "lucide-react";
import { useMenu } from "@/hooks/use-menu";
import { useAuthStore } from "@/stores/auth-store";
import { DynamicIcon } from "@/lib/dynamic-icon";
import { avatarColorClass, initials } from "@/lib/avatar-color";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
      className={cn(
        "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
        collapsed ? "w-[4.5rem]" : "w-64",
      )}
    >
      <SidebarContent collapsed={collapsed} />
    </aside>
  );
}

export function MobileSidebar({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 flex-col bg-sidebar p-0 text-sidebar-foreground">
        <SheetHeader className="sr-only">
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <SidebarContent collapsed={false} onNavigate={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { data: modulos, isLoading } = useMenu();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const empresaAtiva = user?.empresas.find((empresa) => empresa.empresaId === user.empresaAtivaId);
  const logo = assetUrl(empresaAtiva?.logoUrl);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());

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
      <div className="flex h-16 shrink-0 items-center justify-center px-3">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={empresaAtiva?.nomeFantasia ?? "Empresa ativa"}
            className={cn("max-h-11 object-contain", collapsed ? "max-w-11" : "max-w-[180px]")}
          />
        ) : (
          <span className={cn("truncate text-center font-semibold", collapsed ? "text-xs" : "text-sm")}>
            {collapsed
              ? empresaAtiva?.nomeFantasia.slice(0, 2).toUpperCase()
              : empresaAtiva?.nomeFantasia ?? "Plataforma Comercial"}
          </span>
        )}
      </div>

      <nav className={cn("flex-1 space-y-5 overflow-y-auto px-3 pt-4 pb-4", collapsed && "px-2")}>
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

        {modulos?.map((modulo) =>
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
              <DropdownMenuContent side="right" align="start" className="min-w-48">
                <DropdownMenuLabel>{modulo.nome}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {modulo.menus.map((menu) => (
                  <DropdownMenuItem key={menu.id} asChild>
                    <Link
                      href={menu.rota ?? "#"}
                      className={cn(
                        "flex items-center gap-2",
                        pathname === menu.rota && "bg-accent text-accent-foreground",
                      )}
                    >
                      <DynamicIcon name={menu.icone} className="size-4" />
                      <span>{menu.nome}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Collapsible key={modulo.id} open={!closedGroups.has(modulo.id)} onOpenChange={() => toggleGroup(modulo.id)}>
              <CollapsibleTrigger className="group flex w-full items-center justify-between px-3 py-1 text-left">
                <span className="font-mono text-[0.68rem] font-medium tracking-widest text-sidebar-foreground/50 uppercase">
                  {modulo.nome}
                </span>
                <ChevronDown className="size-3.5 text-sidebar-foreground/40 transition-transform group-data-[state=closed]:-rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-0.5 pt-1">
                {modulo.menus.map((menu) => (
                  <NavLink
                    key={menu.id}
                    href={menu.rota ?? "#"}
                    icon={<DynamicIcon name={menu.icone} className="size-4" />}
                    label={menu.nome}
                    active={pathname === menu.rota}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          ),
        )}
      </nav>

      {user && (
        <div className={cn("shrink-0 border-t border-sidebar-border p-3", collapsed && "flex justify-center px-2")}>
          <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
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
                <p className="truncate text-xs text-sidebar-foreground/50">{user.email}</p>
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
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
