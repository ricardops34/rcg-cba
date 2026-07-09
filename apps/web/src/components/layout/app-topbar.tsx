"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Bell, Building2, ChevronDown, HelpCircle, LogOut, Menu, Moon, Search, Sun } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { CurrentUser } from "@plataforma/contracts";
import { avatarColorClass, initials } from "@/lib/avatar-color";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlobalSearch } from "@/components/layout/global-search";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AppTopbar({
  onToggleSidebar,
  title,
  subtitle,
}: {
  onToggleSidebar: () => void;
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { user, logout, setTokens, setUser } = useAuthStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const empresaAtiva = user?.empresas.find((e) => e.empresaId === user.empresaAtivaId);
  const podeTrocar = (user?.empresas.length ?? 0) > 1;

  const handleSwitch = async (empresaId: string) => {
    if (empresaId === user?.empresaAtivaId || switching) return;
    setSwitching(true);
    try {
      const tokens = await apiFetch<{ accessToken: string; refreshToken: string }>(
        "/auth/switch-empresa",
        { method: "POST", body: { empresaId } },
      );
      setTokens(tokens.accessToken, tokens.refreshToken);
      const me = await apiFetch<CurrentUser>("/auth/me");
      setUser(me);
      // Recarrega a app inteira: garante que nenhum dado em cache da
      // empresa anterior fique visível na tela após a troca.
      window.location.href = "/";
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao trocar de empresa");
      setSwitching(false);
    }
  };

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border/70 bg-background px-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onToggleSidebar} aria-label="Recolher menu">
            <Menu className="size-4.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Recolher menu</TooltipContent>
      </Tooltip>

      {title && (
        <div className="hidden shrink-0 md:block">
          <p className="text-sm leading-tight font-semibold">{title}</p>
          {subtitle && <p className="text-xs leading-tight text-muted-foreground">{subtitle}</p>}
        </div>
      )}

      <button
        onClick={() => setSearchOpen(true)}
        className="ml-2 flex h-8 flex-1 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted sm:max-w-xs"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Buscar no sistema...</span>
        <kbd className="hidden rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[0.65rem] sm:inline">
          ⌘K
        </kbd>
      </button>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

      <div className="ml-auto flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Notificações">
              <Bell className="size-4.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Notificações</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Nenhuma notificação por enquanto.
            </p>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Ajuda">
              <HelpCircle className="size-4.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ajuda</TooltipContent>
        </Tooltip>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Alternar tema"
        >
          <Sun className="size-4.5 scale-100 dark:scale-0" />
          <Moon className="absolute size-4.5 scale-0 dark:scale-100" />
        </Button>

        {empresaAtiva && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="ml-1 hidden items-center gap-2 px-2 sm:flex"
                disabled={switching}
              >
                <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Building2 className="size-4" />
                </div>
                <div className="text-left leading-tight">
                  <p className="text-xs font-medium">{empresaAtiva.nomeFantasia}</p>
                  <p className="text-[0.65rem] text-muted-foreground">Empresa ativa</p>
                </div>
                {podeTrocar && <ChevronDown className="size-3.5 text-muted-foreground" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Empresas vinculadas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {user?.empresas.map((e) => (
                <DropdownMenuItem
                  key={e.empresaId}
                  disabled={e.empresaId === user.empresaAtivaId}
                  onClick={() => handleSwitch(e.empresaId)}
                >
                  {e.nomeFantasia}
                  {e.empresaId === user.empresaAtivaId && (
                    <Badge variant="outline" className="ml-auto">
                      Ativa
                    </Badge>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2">
              <div
                className={
                  "flex size-7 items-center justify-center rounded-full text-xs font-semibold " +
                  (user ? avatarColorClass(user.nome) : "bg-muted")
                }
              >
                {user ? initials(user.nome) : "?"}
              </div>
              <span className="hidden text-sm font-medium sm:inline">{user?.nome}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="size-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
