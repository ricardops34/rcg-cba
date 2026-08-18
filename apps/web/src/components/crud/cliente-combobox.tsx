"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Check } from "lucide-react";
import type { Cliente } from "@plataforma/contracts";
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
 * Select de cliente com busca no servidor — a carteira pode ter milhares de
 * clientes, não cabe num Select comum. A busca em GET /clientes já vem
 * restrita ao escopo hierárquico do usuário logado (ClientesService.findAll).
 */
export function ClienteCombobox({
  value,
  onChange,
  placeholder = "Selecionar cliente",
  disabled = false,
  vendedorId,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /**
   * Restringe a busca à carteira de um vendedor.
   *
   * O escopo do usuário já limita a lista, mas nem sempre o bastante: um
   * supervisor enxerga a equipe inteira, e há casos (vincular contato de
   * WhatsApp a cliente) em que a carteira que vale é a do **vendedor da
   * conversa**, não a de quem está mexendo.
   */
  vendedorId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["clientes", "combobox", search, vendedorId],
    queryFn: () =>
      apiFetch<{ data: Cliente[] }>("/clientes", {
        query: {
          pageSize: 50,
          search: search || undefined,
          ativo: true,
          ...(vendedorId ? { vendedorId } : {}),
        },
      }),
    enabled: open,
  });
  const opcoesBusca = data?.data ?? [];

  // Mantém o rótulo do valor selecionado mesmo quando ele não está na página
  // atual de resultados da busca.
  const selecionadoQuery = useQuery({
    queryKey: ["clientes", value],
    queryFn: () => apiFetch<Cliente>(`/clientes/${value}`),
    enabled: !!value,
  });
  const rotulo = value
    ? (selecionadoQuery.data
        ? selecionadoQuery.data.nomeFantasia || selecionadoQuery.data.razaoSocial
        : "...")
    : placeholder;

  // Ao abrir sem busca digitada, garante que o cliente já selecionado
  // apareça na lista (com o check marcado) mesmo que não esteja entre os 50
  // primeiros resultados padrão — senão o combobox abre "vazio" pra quem já
  // escolheu um cliente fora dessa primeira página.
  const opcoes =
    !search && value && selecionadoQuery.data && !opcoesBusca.some((c) => c.id === value)
      ? [selecionadoQuery.data, ...opcoesBusca]
      : opcoesBusca;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground")}
        >
          <span className="truncate">{rotulo}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar cliente..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            <CommandItem
              value="__none__"
              onSelect={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              <Check className={cn("size-4", value ? "opacity-0" : "opacity-100")} />
              Sem cliente
            </CommandItem>
            {opcoes.map((c) => (
              <CommandItem
                key={c.id}
                value={c.id}
                onSelect={() => {
                  onChange(c.id);
                  setOpen(false);
                }}
              >
                <Check className={cn("size-4", value === c.id ? "opacity-100" : "opacity-0")} />
                {c.nomeFantasia || c.razaoSocial}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
