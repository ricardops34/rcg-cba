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
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <LayoutDashboard className="size-4" />
        </div>
        <span className="font-semibold tracking-tight">Plataforma Comercial</span>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pt-3 pb-4">
        <NavLink href="/" icon={<LayoutDashboard className="size-4" />} label="Dashboard" active={pathname === "/"} />

        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full bg-sidebar-accent/60" />
          ))}

        {modulos?.map((modulo) => (
          <div key={modulo.id}>
            <p className="mb-1.5 px-3 font-mono text-[0.68rem] font-medium tracking-widest text-sidebar-foreground/45 uppercase">
              {modulo.nome}
            </p>
            <div className="space-y-0.5">
              {modulo.menus.map((menu) => (
                <NavLink
                  key={menu.id}
                  href={menu.rota ?? "#"}
                  icon={<DynamicIcon name={menu.icone} className="size-4" />}
                  label={menu.nome}
                  active={pathname === menu.rota}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

function NavLink({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md border-l-2 border-transparent py-2 pr-3 pl-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active && "border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
