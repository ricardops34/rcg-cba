"use client";

import Link from "next/link";
import { MonitorUp } from "lucide-react";
import { usePathname } from "next/navigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMenu } from "@/hooks/use-menu";
import { Button } from "@/components/ui/button";

/** Impede acesso direto a telas que o cadastro de Menu marcou como desktop. */
export function ResponsiveRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const { data: modulos } = useMenu();
  const entradaAtual = modulos
    ?.flatMap((modulo) => modulo.menus.map((menu) => ({ modulo, menu })))
    .find(({ menu }) =>
      menu.rota && (pathname === menu.rota || pathname.startsWith(`${menu.rota}/`)),
    );
  const menuAtual = entradaAtual?.menu;
  const disponivelTelaPequena = Boolean(
    entradaAtual?.modulo.disponivelTelaPequena &&
      menuAtual?.disponivelTelaPequena &&
      menuAtual.rotinas.some((rotina) => rotina.disponivelTelaPequena),
  );

  if (!isMobile || !menuAtual || disponivelTelaPequena) return children;

  return (
    <div className="flex min-h-[50svh] items-center justify-center">
      <div className="max-w-md space-y-4 rounded-xl border bg-card p-6 text-center shadow-sm">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
          <MonitorUp className="size-6 text-muted-foreground" />
        </span>
        <div>
          <h1 className="text-lg font-semibold">Abra esta rotina em uma tela maior</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {menuAtual.nome} foi desabilitada em telas pequenas porque seus controles
            precisam de mais espaço para funcionar corretamente.
          </p>
        </div>
        <Button asChild>
          <Link href="/">Voltar ao início</Link>
        </Button>
      </div>
    </div>
  );
}
