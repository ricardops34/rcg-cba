"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

export interface FilterMultiSelectOption {
  value: string;
  label: string;
  searchText?: string;
}

/** Multi-select compacto para filtros de listagem; vazio representa "todos". */
export function FilterMultiSelect({
  value,
  onChange,
  options,
  placeholder = "Todos",
  searchPlaceholder = "Buscar...",
  emptyMessage = "Nenhuma opção encontrada.",
}: {
  value: string[];
  onChange: (values: string[]) => void;
  options: FilterMultiSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const selecionada = value.length === 1
    ? options.find((option) => option.value === value[0])
    : undefined;
  const rotulo =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (selecionada?.label ?? "1 selecionado")
        : `${value.length} selecionados`;

  const alternar = (id: string) =>
    onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            value.length === 0 && "text-muted-foreground",
          )}
        >
          <span className="truncate">{rotulo}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandItem
              value={placeholder}
              onSelect={() => {
                onChange([]);
                setOpen(false);
              }}
            >
              <Check className={cn("size-4", value.length === 0 ? "opacity-100" : "opacity-0")} />
              {placeholder}
            </CommandItem>
            <CommandSeparator />
            {options.map((option) => (
              <CommandItem
                key={option.value}
                value={`${option.label} ${option.searchText ?? ""} ${option.value}`}
                onSelect={() => alternar(option.value)}
              >
                <Check
                  className={cn(
                    "size-4",
                    value.includes(option.value) ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="truncate">{option.label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
