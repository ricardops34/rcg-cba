"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Building2,
  Check,
  CirclePlay,
  HelpCircle,
  Info,
  LogOut,
  Menu,
  Moon,
  Pencil,
  Search,
  Sun,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch, ApiError, assetUrl } from "@/lib/api-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { CurrentUser } from "@plataforma/contracts";
import { avatarColorClass, initials } from "@/lib/avatar-color";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/layout/global-search";
import { NotificacoesSino } from "@/components/layout/notificacoes-sino";
import { AgenteBotaoTopbar } from "@/components/agente/agente-botao-topbar";
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
import { ajudaPorRota } from "@/lib/ajuda-rotinas";
import { useTour } from "@/components/tour/tour-provider";

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
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { user, logout, setTokens, setUser } = useAuthStore();
  const { iniciarTourAtual, tourDisponivel } = useTour();
  const [searchOpen, setSearchOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const empresaAtiva = user?.empresas.find(
    (e) => e.empresaId === user.empresaAtivaId,
  );
  const ajudaAtual = ajudaPorRota(pathname);

  const handleSwitch = async (empresaId: string) => {
    if (empresaId === user?.empresaAtivaId || switching) return;
    setSwitching(true);
    try {
      const tokens = await apiFetch<{
        accessToken: string;
        refreshToken: string;
      }>("/auth/switch-empresa", { method: "POST", body: { empresaId } });
      setTokens(tokens.accessToken, tokens.refreshToken);
      const me = await apiFetch<CurrentUser>("/auth/me");
      setUser(me);
      // Recarrega a app inteira: garante que nenhum dado em cache da
      // empresa anterior fique visível na tela após a troca.
      window.location.assign("/");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Erro ao trocar de empresa",
      );
      setSwitching(false);
    }
  };

  return (
    <header className="flex h-14 min-w-0 items-center gap-1 border-b border-border/70 bg-background px-2 sm:gap-3 sm:px-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            aria-label="Recolher menu"
            data-tour="alternar-menu"
          >
            <Menu className="size-4.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Recolher menu</TooltipContent>
      </Tooltip>

      {title && (
        <div className="hidden shrink-0 md:block">
          <p className="text-sm leading-tight font-semibold">{title}</p>
          {subtitle && (
            <p className="text-xs leading-tight text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
      )}

      <button
        data-tour="busca-global"
        onClick={() => setSearchOpen(true)}
        aria-label="Buscar no sistema"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-sm text-muted-foreground transition-colors hover:bg-muted sm:ml-2 sm:h-8 sm:w-auto sm:max-w-xs sm:flex-1 sm:justify-start sm:gap-2 sm:px-3"
      >
        <Search className="size-3.5" />
        <span className="hidden flex-1 text-left sm:inline">
          Buscar no sistema...
        </span>
        <kbd className="hidden rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[0.65rem] sm:inline">
          ⌘K
        </kbd>
      </button>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />

      <div className="ml-auto flex items-center gap-1">
        <div data-tour="notificacoes">
          <NotificacoesSino />
        </div>
        <div data-tour="assistente">
          <AgenteBotaoTopbar />
        </div>

        {tourDisponivel && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="hidden sm:inline-flex"
                variant="ghost"
                size="icon"
                aria-label="Refazer tour desta tela"
                onClick={iniciarTourAtual}
                data-tour="refazer-tour"
              >
                <CirclePlay className="size-4.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refazer tour</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="hidden sm:inline-flex"
              variant="ghost"
              size="icon"
              aria-label="Ajuda desta rotina"
              onClick={() => router.push(ajudaAtual?.href ?? "/ajuda")}
              data-tour="ajuda"
            >
              <HelpCircle className="size-4.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {ajudaAtual ? "Ajuda desta rotina" : "Central de ajuda"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="hidden sm:inline-flex"
              variant="ghost"
              size="icon"
              aria-label="Sobre o sistema"
              onClick={() => router.push("/ajuda/sobre")}
            >
              <Info className="size-4.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Sobre o sistema</TooltipContent>
        </Tooltip>

        <Button
          data-tour="tema"
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Alternar tema"
        >
          <Sun className="size-4.5 scale-100 dark:scale-0" />
          <Moon className="absolute size-4.5 scale-0 dark:scale-100" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label="Conta"
              data-tour="conta"
            >
              <Avatar className="size-8 ring-2 ring-background">
                <AvatarImage src={assetUrl(user?.avatarUrl) ?? undefined} alt={user?.nome ?? "Conta"} />
                <AvatarFallback className={user ? avatarColorClass(user.nome) : "bg-muted"}>
                  {user ? initials(user.nome) : "?"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-80 max-w-[calc(100vw-1rem)] rounded-xl p-2">
            {/* O cabeçalho é o próprio atalho para o perfil: clicar na foto ou
                no nome abre "Meu perfil". Era um item separado na lista, e o
                menu ficava com duas linhas dizendo a mesma coisa. */}
            <DropdownMenuItem
              className="group flex items-center gap-3 rounded-lg bg-muted/50 p-3 focus:bg-muted"
              title="Meu perfil — foto, dados da conta e senha"
              onClick={() => router.push("/perfil")}
            >
              <Avatar className="size-12 shrink-0">
                <AvatarImage src={assetUrl(user?.avatarUrl) ?? undefined} alt={user?.nome ?? "Conta"} />
                <AvatarFallback className={user ? avatarColorClass(user.nome) : "bg-muted"}>{user ? initials(user.nome) : "?"}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 space-y-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                  {user?.nome}
                  <Pencil className="size-3 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                </p>
                <p className="truncate text-xs font-medium text-primary">{empresaAtiva?.perfilNome}</p>
              </div>
            </DropdownMenuItem>
            {empresaAtiva && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Building2 className="size-3.5" />
                  {switching ? "Trocando empresa…" : "Suas empresas"}
                </DropdownMenuLabel>
                {user?.empresas.map((empresa) => {
                  const ativa = empresa.empresaId === user.empresaAtivaId;
                  return (
                    <DropdownMenuItem
                      key={empresa.empresaId}
                      disabled={switching}
                      className={ativa ? "my-1 gap-3 rounded-lg bg-primary/10 py-2.5 text-primary" : "my-1 gap-3 rounded-lg py-2.5"}
                      onSelect={(event) => { if (ativa) event.preventDefault(); else void handleSwitch(empresa.empresaId); }}
                    >
                      <Building2 className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium" title={empresa.nomeFantasia}>{empresa.nomeFantasia}</span>
                        {ativa && <span className="block text-[11px]">Empresa ativa</span>}
                      </span>
                      {ativa && (
                        <Check className="ml-auto size-4 text-primary" />
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="sm:hidden"
              onClick={() => router.push(ajudaAtual?.href ?? "/ajuda")}
            >
              <HelpCircle className="size-4" />
              Ajuda
            </DropdownMenuItem>
            <DropdownMenuItem
              className="sm:hidden"
              onClick={() => router.push("/ajuda/sobre")}
            >
              <Info className="size-4" />
              Sobre o sistema
            </DropdownMenuItem>
            {tourDisponivel && (
              <DropdownMenuItem
                className="sm:hidden"
                onClick={iniciarTourAtual}
              >
                <CirclePlay className="size-4" />
                Refazer tour
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="rounded-lg py-2.5 text-destructive focus:bg-destructive/10 focus:text-destructive" onClick={handleLogout}>
              <LogOut className="size-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
