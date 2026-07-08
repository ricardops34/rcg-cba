"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { useMenu } from "@/hooks/use-menu";
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
        {modulos?.map((modulo) => (
          <CommandGroup key={modulo.id} heading={modulo.nome}>
            {modulo.menus.map((menu) => (
              <CommandItem key={menu.id} onSelect={() => go(menu.rota ?? "#")}>
                <DynamicIcon name={menu.icone} />
                {menu.nome}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
