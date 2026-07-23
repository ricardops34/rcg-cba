"use client";

import { useState } from "react";
import * as LucideIcons from "lucide-react";
import { ChevronsUpDown } from "lucide-react";
import { DynamicIcon } from "@/lib/dynamic-icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

// Exports do pacote lucide-react que não são componentes de ícone.
const NON_ICON_EXPORTS = new Set(["createLucideIcon", "Icon", "icons", "defaultAttributes"]);

function pascalToKebab(s: string) {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

const ICON_NAMES = Array.from(
  new Set(
    Object.keys(LucideIcons)
      .filter((k) => /^[A-Z]/.test(k) && !NON_ICON_EXPORTS.has(k))
      .map(pascalToKebab),
  ),
).sort();

interface IconPickerProps {
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function IconPicker({ value, onChange, placeholder = "Selecionar ícone..." }: IconPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            <DynamicIcon name={value} className="size-4 shrink-0 text-muted-foreground" />
            {value || <span className="text-muted-foreground">{placeholder}</span>}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar ícone..." />
          <CommandList>
            <CommandEmpty>Nenhum ícone encontrado.</CommandEmpty>
            <CommandGroup>
              {ICON_NAMES.map((name) => (
                <CommandItem
                  key={name}
                  value={name}
                  onSelect={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                >
                  <DynamicIcon name={name} className="size-4" />
                  {name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
