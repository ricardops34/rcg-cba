"use client";

import { useState } from "react";
import Image from "next/image";
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
import { cn } from "@/lib/utils";

export function AppSidebar({ collapsed }: { collapsed: boolean }) {
  const { data: modulos, isLoading } = useMenu();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
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
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
        collapsed ? "w-[4.5rem]" : "w-64",
      )}
    >
      <div className={cn("flex h-16 items-center px-5", collapsed && "justify-center px-0")}>
        {collapsed ? (
          // Recolhida: apenas a gota do logo (recorte da arte completa)
          <div className="h-9 w-9 overflow-hidden" aria-label="RCG Distribuidora">
            <Image
              src="/rcglogo.png"
              alt="RCG Distribuidora"
              width={106}
              height={36}
              className="max-w-none brightness-0 invert"
            />
          </div>
        ) : (
          <Image
            src="/rcglogo.png"
            alt="RCG Distribuidora"
            width={118}
            height={40}
            priority
            className="brightness-0 invert"
          />
        )}
      </div>

      <nav className={cn("flex-1 space-y-5 overflow-y-auto px-3 pt-4 pb-4", collapsed && "px-2")}>
        <NavLink
          href="/"
          icon={<LayoutDashboard className="size-4" />}
          label="Dashboard"
          active={pathname === "/"}
          collapsed={collapsed}
        />

        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-md" />
          ))}

        {modulos?.map((modulo) =>
          collapsed ? (
            <div key={modulo.id} className="space-y-0.5">
              {modulo.menus.map((menu) => (
                <NavLink
                  key={menu.id}
                  href={menu.rota ?? "#"}
                  icon={<DynamicIcon name={menu.icone} className="size-4" />}
                  label={menu.nome}
                  active={pathname === menu.rota}
                  collapsed={collapsed}
                />
              ))}
            </div>
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
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          ),
        )}
      </nav>

      {user && (
        <div className={cn("border-t border-sidebar-border p-3", collapsed && "flex justify-center px-2")}>
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
    </aside>
  );
}

function NavLink({
  href,
  icon,
  label,
  active,
  collapsed,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  const link = (
    <Link
      href={href}
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
