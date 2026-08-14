"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Star, Trash2 } from "lucide-react";
import type { Cnae, ClienteCnae } from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldDescription } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/** Combobox sobre a referência de CNAEs, com busca no servidor. */
function CnaeCombobox({ onSelect }: { onSelect: (cnae: Cnae) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["cnaes", "combobox", search],
    queryFn: () =>
      apiFetch<{ data: Cnae[] }>("/cnaes", {
        query: { pageSize: 50, search: search || undefined, ativo: true },
      }),
    enabled: open,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal text-muted-foreground"
        >
          <span className="truncate">Adicionar CNAE...</span>
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
              Nenhum CNAE encontrado. A referência é carregada pelo sync do IBGE.
            </CommandEmpty>
            {(data?.data ?? []).map((c) => (
              <CommandItem
                key={c.id}
                value={c.id}
                onSelect={() => {
                  onSelect(c);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <Check className="size-4 opacity-0" />
                <span className="truncate">
                  {c.codigoErp} — {c.descricao}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * CNAEs do cliente (ramo de atividade). Só aparece em modo edição — precisa de
 * um cliente salvo para pendurar a coleção.
 *
 * Vive dentro do <form> do cliente, então é uma <div> que grava por conta
 * própria (mesmo motivo do bloco de horários no cadastro de usuário): cada
 * vínculo é gravado na hora, não junto com o botão Salvar do formulário.
 */
export function ClienteCnaeSection({
  clienteId,
  readOnly = false,
}: {
  clienteId: string;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const chave = ["clientes", clienteId, "cnaes"];

  const { data, isLoading } = useQuery({
    queryKey: chave,
    queryFn: () => apiFetch<ClienteCnae[]>(`/clientes/${clienteId}/cnaes`),
  });
  const cnaes = data ?? [];

  const invalidar = () => queryClient.invalidateQueries({ queryKey: chave });
  const aoFalhar = (err: unknown, padrao: string) =>
    toast.error(err instanceof ApiError ? err.message : padrao);

  const adicionar = useMutation({
    mutationFn: (cnae: Cnae) =>
      apiFetch<ClienteCnae>(`/clientes/${clienteId}/cnaes`, {
        method: "POST",
        // Primeiro CNAE do cliente entra como principal: é o caso comum, e
        // poupa um clique extra em quase todo cadastro.
        body: { cnaeId: cnae.id, principal: cnaes.length === 0 },
      }),
    onSuccess: () => {
      void invalidar();
      toast.success("CNAE vinculado");
    },
    onError: (err) => aoFalhar(err, "Erro ao vincular o CNAE"),
  });

  const definirPrincipal = useMutation({
    mutationFn: (id: string) =>
      apiFetch<ClienteCnae>(`/clientes/${clienteId}/cnaes/${id}/principal`, {
        method: "PATCH",
      }),
    onSuccess: () => {
      void invalidar();
      toast.success("CNAE principal atualizado");
    },
    onError: (err) => aoFalhar(err, "Erro ao definir o CNAE principal"),
  });

  const remover = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/clientes/${clienteId}/cnaes/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void invalidar();
      toast.success("CNAE desvinculado");
    },
    onError: (err) => aoFalhar(err, "Erro ao desvincular o CNAE"),
  });

  return (
    <div className="rounded-lg border p-3">
      <span className="text-sm font-medium">Ramo de atividade (CNAE)</span>
      <FieldDescription className="pt-1">
        O CNAE identifica o ramo do cliente e alimenta a sugestão de compra —
        clientes do mesmo ramo tendem a comprar os mesmos produtos. Um deles é o
        principal (fiscal); os demais são secundários.
      </FieldDescription>

      <div className="space-y-2 pt-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : cnaes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum CNAE vinculado. Use &quot;Consultar CNPJ&quot; para trazer da
            Receita Federal, ou escolha abaixo.
          </p>
        ) : (
          cnaes.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
            >
              <span className="font-mono text-xs text-muted-foreground">{c.codigo}</span>
              <span className="min-w-0 flex-1 truncate">{c.descricao}</span>
              {c.principal ? (
                <Badge variant="secondary">Principal</Badge>
              ) : (
                !readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    title="Tornar principal"
                    onClick={() => definirPrincipal.mutate(c.id)}
                    disabled={definirPrincipal.isPending}
                  >
                    <Star className="size-4" />
                  </Button>
                )
              )}
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title="Desvincular"
                  onClick={() => remover.mutate(c.id)}
                  disabled={remover.isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      {!readOnly && (
        <div className={cn("pt-3", adicionar.isPending && "pointer-events-none opacity-50")}>
          <CnaeCombobox onSelect={(cnae) => adicionar.mutate(cnae)} />
        </div>
      )}
    </div>
  );
}
