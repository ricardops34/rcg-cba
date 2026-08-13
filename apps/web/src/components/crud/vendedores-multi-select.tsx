"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Users } from "lucide-react";
import { useVendedoresEscopo, vendedorFiltroLabel } from "@/hooks/use-vendedores-escopo";
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

/**
 * Filtro de vendedor com seleção múltipla, sobre o escopo hierárquico do
 * usuário (o hook já devolve só quem ele alcança).
 *
 * Diferenças em relação aos comboboxes de cliente/produto, e o porquê:
 *
 * - a lista não é buscada no servidor a cada tecla — o escopo cabe todo em
 *   memória (uma equipe, não 6 mil clientes), então o filtro do Command basta;
 * - clicar num item **não fecha** o popover: em seleção múltipla, fechar a
 *   cada clique obrigaria a reabrir para cada vendedor;
 * - lista vazia significa "todos do escopo", que é o padrão das consultas —
 *   por isso "Todos os vendedores" é uma opção de verdade no topo, e não um
 *   estado que se alcança desmarcando um por um.
 */
export function VendedoresMultiSelect({
  value,
  onChange,
  placeholder = "Todos",
}: {
  /** Ids selecionados; vazio = todos do escopo. */
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data } = useVendedoresEscopo();
  const opcoes = data?.data ?? [];

  const alternar = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  const selecionados = opcoes.filter((v) => value.includes(v.id));
  const rotulo =
    value.length === 0
      ? placeholder
      : selecionados.length === 1
        ? vendedorFiltroLabel(selecionados[0])
        : `${value.length} vendedores`;

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
          <span className="flex min-w-0 items-center gap-2">
            <Users className="size-4 shrink-0 opacity-60" />
            <span className="truncate">{rotulo}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar vendedor..." />
          <CommandList>
            <CommandEmpty>Nenhum vendedor encontrado.</CommandEmpty>
            <CommandItem
              value="todos os vendedores"
              onSelect={() => {
                onChange([]);
                setOpen(false);
              }}
            >
              <Check className={cn("size-4", value.length === 0 ? "opacity-100" : "opacity-0")} />
              Todos os vendedores
            </CommandItem>
            <CommandSeparator />
            {opcoes.map((v) => {
              const rotuloItem = vendedorFiltroLabel(v);
              return (
                <CommandItem
                  // O id entra no value para nomes repetidos não se
                  // canibalizarem no filtro do Command; a busca continua
                  // casando pelo nome, que vem antes.
                  key={v.id}
                  value={`${rotuloItem} ${v.id}`}
                  onSelect={() => alternar(v.id)}
                >
                  <Check
                    className={cn(
                      "size-4",
                      value.includes(v.id) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {rotuloItem}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
