"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronsUpDown, Loader2, SlidersHorizontal, X } from "lucide-react";
import type { RelatorioOpcao, RelatorioOpcaoTipo } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

/** `000123 — RAZÃO SOCIAL`, como aparece no chip e no cabeçalho do PDF. */
export const rotuloOpcao = (o: RelatorioOpcao) => (o.codigo ? `${o.codigo} — ${o.nome}` : o.nome);

/** Ids para a query da API: `a,b,c`. */
export const idsDe = (opcoes: { id: string }[]) => opcoes.map((o) => o.id).join(",");

function useDebounce<T>(valor: T, ms = 300) {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return atrasado;
}

/**
 * Seleção múltipla com busca no servidor, para os filtros de produto,
 * fornecedor e cliente dos relatórios (`/relatorios/opcoes/:tipo`).
 *
 * - guarda o objeto escolhido, não só o id: o rótulo continua no chip e no
 *   PDF quando a busca já mudou;
 * - clicar não fecha — escolhem-se vários de uma vez;
 * - "Marcar todos os resultados" faz o papel do antigo "contém": buscar
 *   `HIGIN` e marcar tudo o que veio.
 */
export function BuscaMultiSelect({
  tipo,
  value,
  onChange,
  placeholder = "Todos",
  buscaPlaceholder,
}: {
  tipo: RelatorioOpcaoTipo;
  value: RelatorioOpcao[];
  onChange: (v: RelatorioOpcao[]) => void;
  placeholder?: string;
  buscaPlaceholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const buscaAtrasada = useDebounce(busca.trim());

  const { data, isFetching } = useQuery({
    queryKey: ["relatorios", "opcoes", tipo, buscaAtrasada],
    queryFn: () =>
      apiFetch<RelatorioOpcao[]>(`/relatorios/opcoes/${tipo}`, {
        query: { busca: buscaAtrasada || undefined },
      }),
    enabled: open,
    staleTime: 60_000,
  });
  const resultados = data ?? [];

  const marcado = (id: string) => value.some((v) => v.id === id);
  const alternar = (o: RelatorioOpcao) =>
    onChange(marcado(o.id) ? value.filter((v) => v.id !== o.id) : [...value, o]);
  const naoMarcados = resultados.filter((o) => !marcado(o.id));

  const rotulo =
    value.length === 0 ? placeholder : value.length === 1 ? rotuloOpcao(value[0]) : `${value.length} selecionados`;

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setBusca("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", value.length === 0 && "text-muted-foreground")}
        >
          <span className="truncate">{rotulo}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(32rem,calc(100vw-2rem))] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={buscaPlaceholder} value={busca} onValueChange={setBusca} />
          <CommandList className="max-h-80">
            {value.length > 0 && (
              <>
                <CommandGroup heading={`Selecionados (${value.length})`}>
                  {value.map((o) => (
                    <ItemOpcao key={o.id} opcao={o} marcado onSelect={() => alternar(o)} />
                  ))}
                  <CommandItem value="__limpar__" onSelect={() => onChange([])} className="text-muted-foreground">
                    <X className="size-4" />
                    Limpar seleção
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            {isFetching && resultados.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Buscando...
              </div>
            ) : (
              <CommandEmpty>Nada encontrado.</CommandEmpty>
            )}
            {naoMarcados.length > 0 && (
              <CommandGroup heading={buscaAtrasada ? "Resultados" : "Primeiros da lista — digite para buscar"}>
                {buscaAtrasada && naoMarcados.length > 1 && (
                  <CommandItem
                    value="__todos__"
                    onSelect={() => onChange([...value, ...naoMarcados])}
                    className="font-medium text-primary"
                  >
                    <Check className="size-4" />
                    Marcar todos os {naoMarcados.length} resultados
                  </CommandItem>
                )}
                {naoMarcados.map((o) => (
                  <ItemOpcao key={o.id} opcao={o} marcado={false} onSelect={() => alternar(o)} />
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ItemOpcao({ opcao, marcado, onSelect }: { opcao: RelatorioOpcao; marcado: boolean; onSelect: () => void }) {
  return (
    <CommandItem value={opcao.id} onSelect={onSelect} className="items-start">
      <Check className={cn("mt-0.5 size-4 shrink-0", marcado ? "opacity-100" : "opacity-0")} />
      <div className="min-w-0">
        <div className="truncate">
          {opcao.codigo && <span className="mr-1.5 font-mono text-xs text-muted-foreground">{opcao.codigo}</span>}
          {opcao.nome}
        </div>
        {opcao.detalhe && <div className="truncate text-xs text-muted-foreground">{opcao.detalhe}</div>}
      </div>
    </CommandItem>
  );
}

/** Um filtro preenchido, para os chips do painel e o cabeçalho do PDF. */
export interface FiltroAtivo {
  rotulo: string;
  /** Um chip por valor; remover tira só aquele valor. */
  valores: { id: string; texto: string }[];
  remover: (id: string) => void;
}

/** `Produto: A, B, C` para o cabeçalho do PDF e do Excel. */
export const filtrosEmTexto = (filtros: FiltroAtivo[]): [string, string | undefined][] =>
  filtros.map((f) => [f.rotulo, f.valores.map((v) => v.texto).join(", ") || undefined]);

/**
 * Painel de filtros dos relatórios: o período e o **Gerar** sempre à vista; o
 * resto numa cortina que recolhe ao gerar, para a tabela ganhar a tela. O que
 * está escolhido continua visível como chip, com o × para tirar.
 */
export function PainelFiltros({
  principais,
  children,
  ativos,
  onGerar,
}: {
  /** Período e o que mais precisa ficar sempre à vista. */
  principais: ReactNode;
  /** Os demais filtros, na cortina. */
  children: ReactNode;
  ativos: FiltroAtivo[];
  onGerar: () => void;
}) {
  const [aberto, setAberto] = useState(true);
  const preenchidos = ativos.filter((f) => f.valores.length > 0);
  const quantos = preenchidos.reduce((n, f) => n + f.valores.length, 0);

  return (
    <Collapsible open={aberto} onOpenChange={setAberto}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onGerar();
          setAberto(false);
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          {principais}
          <div className="ml-auto flex items-end gap-2">
            <CollapsibleTrigger asChild>
              <Button type="button" variant="outline">
                <SlidersHorizontal className="size-4" />
                Filtros
                {quantos > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground">
                    {quantos}
                  </span>
                )}
                <ChevronDown className={cn("size-4 transition-transform", aberto && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <Button type="submit">Gerar</Button>
          </div>
        </div>

        <CollapsibleContent>
          <div className="grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
        </CollapsibleContent>

        {preenchidos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {preenchidos.flatMap((f) =>
              f.valores.map((v) => (
                <span
                  key={`${f.rotulo}-${v.id}`}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1 pl-2.5 text-xs"
                >
                  <span className="text-muted-foreground">{f.rotulo}:</span>
                  <span className="max-w-64 truncate">{v.texto}</span>
                  <button
                    type="button"
                    aria-label={`Tirar ${v.texto}`}
                    className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                    onClick={() => f.remover(v.id)}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )),
            )}
          </div>
        )}
      </form>
    </Collapsible>
  );
}

/** Rótulo em cima do campo, ocupando a célula da grade da cortina. */
export function CampoFiltro({ rotulo, htmlFor, children }: { rotulo: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={htmlFor}>{rotulo}</Label>
      {children}
    </div>
  );
}
