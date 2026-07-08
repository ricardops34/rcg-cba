"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { useMenu } from "@/hooks/use-menu";
import { DynamicIcon } from "@/lib/dynamic-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const { data: modulos, isLoading } = useMenu();
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <LayoutDashboard className="size-4" />
        </div>
        <span className="font-semibold tracking-tight">Plataforma Comercial</span>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        <Link
          href="/"
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent",
            pathname === "/" && "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
        >
          <LayoutDashboard className="size-4" />
          Dashboard
        </Link>

        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}

        {modulos?.map((modulo) => (
          <div key={modulo.id}>
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {modulo.nome}
            </p>
            <div className="space-y-0.5">
              {modulo.menus.map((menu) => {
                const href = menu.rota ?? "#";
                const active = pathname === href;
                return (
                  <Link
                    key={menu.id}
                    href={href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-sidebar-accent",
                      active && "bg-sidebar-accent text-sidebar-accent-foreground",
                    )}
                  >
                    <DynamicIcon name={menu.icone} className="size-4" />
                    {menu.nome}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
