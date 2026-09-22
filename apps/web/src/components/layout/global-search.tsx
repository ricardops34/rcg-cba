"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { useMenu } from "@/hooks/use-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { DynamicIcon } from "@/lib/dynamic-icon";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const { data: modulos } = useMenu();
  const isMobile = useIsMobile();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Buscar no sistema" description="Navegue para qualquer tela">
      <CommandInput placeholder="Buscar no sistema..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        <CommandGroup heading="Geral">
          <CommandItem onSelect={() => go("/")}>
            <LayoutDashboard />
            Dashboard
          </CommandItem>
        </CommandGroup>
        {modulos?.filter((modulo) => !isMobile || modulo.disponivelTelaPequena).map((modulo) => (
          <CommandGroup key={modulo.id} heading={modulo.nome}>
            {modulo.menus
              // Submenu vira uma linha própria, com o nome do pai à frente:
              // aqui se busca pelo nome da tela, não se navega pela árvore.
              .flatMap((menu) => [
                { menu, rotulo: menu.nome },
                ...(menu.submenus ?? []).map((sub) => ({
                  menu: sub,
                  rotulo: `${menu.nome} › ${sub.nome}`,
                })),
              ])
              .filter(
                ({ menu }) =>
                  menu.rota &&
                  (!isMobile ||
                    (menu.disponivelTelaPequena &&
                      menu.rotinas.some((rotina) => rotina.disponivelTelaPequena))),
              )
              .map(({ menu, rotulo }) => (
              <CommandItem key={menu.id} onSelect={() => go(menu.rota ?? "#")}>
                <DynamicIcon name={menu.icone} />
                {rotulo}
              </CommandItem>
              ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
