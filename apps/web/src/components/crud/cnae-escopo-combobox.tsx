"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Check } from "lucide-react";
import type { CnaeEscopoRow } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/**
 * Select de CNAE com busca no servidor, restrito aos que estão em uso na
 * carteira visível ao usuário (GET /clientes/cnaes-escopo) — não o catálogo
 * inteiro sincronizado do IBGE (esse é o da CnaeCombobox, em
 * cliente-cnae-section.tsx). Busca por prefixo do código ou trecho da
 * descrição; uf/município/vendedorId são as facetas irmãs já selecionadas no
 * painel de Filtros, mesma regra dos combos de UF/Município/Vendedor.
 */
export function CnaeEscopoCombobox({
  value,
  onChange,
  uf,
  municipio,
  vendedorId,
  placeholder = "Qualquer",
}: {
  value: CnaeEscopoRow | null;
  onChange: (cnae: CnaeEscopoRow | null) => void;
  uf?: string;
  municipio?: string;
  vendedorId?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data, isFetching } = useQuery({
    queryKey: ["clientes", "cnaes-escopo", uf, municipio, vendedorId, search],
    queryFn: () =>
      apiFetch<{ data: CnaeEscopoRow[] }>("/clientes/cnaes-escopo", {
        query: { uf, municipio, vendedorId, search: search || undefined },
      }),
    enabled: open,
  });
  const opcoes = data?.data ?? [];
  const rotulo = value ? `${value.codigoErp ?? "—"} — ${value.descricao}` : placeholder;

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
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate">{rotulo}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por código ou descrição..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {isFetching ? "Buscando..." : "Nenhum CNAE em uso encontrado."}
            </CommandEmpty>
            {value && (
              <CommandItem
                value={`limpar-${value.id}`}
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <Check className="size-4 opacity-0" />
                <span className="truncate text-muted-foreground">Qualquer</span>
              </CommandItem>
            )}
            {opcoes.map((c) => (
              <CommandItem
                key={c.id}
                value={c.id}
                onSelect={() => {
                  onChange(c);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <Check
                  className={cn("size-4", value?.id === c.id ? "opacity-100" : "opacity-0")}
                />
                <span className="truncate">
                  {c.codigoErp ?? "—"} — {c.descricao} ({c.total})
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
