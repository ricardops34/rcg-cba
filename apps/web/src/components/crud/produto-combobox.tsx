"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Check } from "lucide-react";
import type { Produto } from "@plataforma/contracts";
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

const saldoBr = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Select de produto com busca no servidor — mesmo padrão de ClienteCombobox.
 *
 * `mostrarSaldo` (orçamento, 17/11/2026): cada opção traz o saldo em estoque
 * depois da descrição — "DESCRIÇÃO (8,00)" —, o mesmo número da coluna Estoque.
 * As opções quebram linha conforme a largura da tela, em vez de cortar.
 */
export function ProdutoCombobox({
  value,
  onChange,
  placeholder = "Selecionar produto",
  mostrarSaldo = false,
}: {
  value: string | null;
  onChange: (produto: Produto | null) => void;
  placeholder?: string;
  mostrarSaldo?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["produtos", "combobox", search, mostrarSaldo],
    queryFn: () =>
      apiFetch<{ data: Array<Produto & { saldoEstoque?: number }> }>("/produtos", {
        query: {
          pageSize: 50,
          search: search || undefined,
          ativo: true,
          ...(mostrarSaldo ? { comSaldo: true } : {}),
        },
      }),
    enabled: open,
  });
  const opcoesBusca = data?.data ?? [];

  // Mantém o rótulo do valor selecionado mesmo quando ele não está na página
  // atual de resultados da busca.
  const selecionadoQuery = useQuery({
    queryKey: ["produtos", value],
    queryFn: () => apiFetch<Produto>(`/produtos/${value}`),
    enabled: !!value,
  });
  const rotulo = value
    ? (selecionadoQuery.data
        ? `${selecionadoQuery.data.codigoErp} — ${selecionadoQuery.data.descricao}`
        : "...")
    : placeholder;

  // Ao abrir sem busca digitada, garante que o produto já selecionado apareça
  // na lista (com o check marcado) mesmo que não esteja entre os 50 primeiros
  // resultados padrão — senão o combobox abre "vazio" pra quem já escolheu
  // um produto fora dessa primeira página.
  const opcoes: Array<Produto & { saldoEstoque?: number }> =
    !search && value && selecionadoQuery.data && !opcoesBusca.some((p) => p.id === value)
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
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground")}
        >
          <span className="truncate">{rotulo}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* Pelo menos a largura do botão; com espaço, até 36rem — e nunca além da
          tela, onde o texto quebra linha. */}
      <PopoverContent
        className="w-[max(var(--radix-popover-trigger-width),min(36rem,calc(100vw-2rem)))] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar produto..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
            {opcoes.map((p) => (
              <CommandItem
                key={p.id}
                value={p.id}
                onSelect={() => {
                  onChange(p);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn("size-4 shrink-0 self-start mt-0.5", value === p.id ? "opacity-100" : "opacity-0")}
                />
                <span className="min-w-0 break-words whitespace-normal">
                  {p.codigoErp} — {p.descricao}
                  {mostrarSaldo && p.saldoEstoque != null && (
                    <span
                      className={cn(
                        "ml-1 tabular-nums",
                        p.saldoEstoque > 0 ? "text-muted-foreground" : "text-destructive",
                      )}
                    >
                      ({saldoBr(p.saldoEstoque)})
                    </span>
                  )}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
