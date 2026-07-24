"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Check } from "lucide-react";
import type { Municipio } from "@plataforma/contracts";
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

type MunicipioRow = Municipio & { estado?: { id: string; sigla: string } | null };

/**
 * Select de município com busca no servidor — são ~5.500 municípios, não
 * cabem num Select comum. Opcionalmente restrito a um estado (estadoId).
 */
export function MunicipioCombobox({
  value,
  onChange,
  estadoId,
  placeholder = "Selecionar município",
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  estadoId?: string | null;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["municipios", "combobox", search, estadoId ?? null],
    queryFn: () =>
      apiFetch<{ data: MunicipioRow[] }>("/municipios", {
        query: { pageSize: 50, search: search || undefined, estadoId: estadoId || undefined },
      }),
    enabled: open,
  });
  const opcoes = data?.data ?? [];

  // Mantém o rótulo do valor selecionado mesmo quando ele não está na página
  // atual de resultados da busca.
  const selecionadoQuery = useQuery({
    queryKey: ["municipios", value],
    queryFn: () => apiFetch<MunicipioRow>(`/municipios/${value}`),
    enabled: !!value,
  });
  const rotulo = value
    ? (selecionadoQuery.data
        ? `${selecionadoQuery.data.descricao}${selecionadoQuery.data.estado ? `/${selecionadoQuery.data.estado.sigla}` : ""}`
        : "...")
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground")}
        >
          <span className="truncate">{rotulo}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar município..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>Nenhum município encontrado.</CommandEmpty>
            <CommandItem
              value="__none__"
              onSelect={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              <Check className={cn("size-4", value ? "opacity-0" : "opacity-100")} />
              Sem município
            </CommandItem>
            {opcoes.map((m) => (
              <CommandItem
                key={m.id}
                value={m.id}
                onSelect={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
              >
                <Check className={cn("size-4", value === m.id ? "opacity-100" : "opacity-0")} />
                {m.descricao}
                {m.estado && <span className="text-muted-foreground">/{m.estado.sigla}</span>}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
