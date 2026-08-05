"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Atividade, Orcamento, TipoAtividade } from "@plataforma/contracts";
import { useResourceList } from "@/hooks/use-resource";
import { useVendedoresEscopo } from "@/hooks/use-vendedores-escopo";
import { useVendedorPadrao } from "@/hooks/use-vendedor-padrao";
import { TIPOS, TIPO_COR } from "@/components/crud/atividade-tipo";
import { STATUS_ORCAMENTO_COR } from "@/components/crud/orcamento-status";
import { QuickFilterButton, QuickFilterGroup } from "@/components/crud/quick-filter-group";
import { FiltersPopover } from "@/components/crud/filters-popover";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ChevronLeft, ChevronRight, Plus } from "lucide-react";

type TipoFiltro = "todos" | TipoAtividade;
type AgendaItem =
  | { kind: "atividade"; id: string; data: Atividade }
  | { kind: "orcamento"; id: string; data: Orcamento };

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MAX_VISIVEL = 3;

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const estaVencida = (a: Atividade) =>
  !a.concluida && !!a.dataVencimento && new Date(a.dataVencimento).getTime() < Date.now();

export default function AgendaPage() {
  const router = useRouter();
  const [mesAtual, setMesAtual] = useState(() => startOfMonth(new Date()));
  const [vendedorId, setVendedorId] = useState<string | undefined>(undefined);
  const [tipo, setTipo] = useState<TipoFiltro>("todos");
  const [somentePendentes, setSomentePendentes] = useState(false);

  const vendedoresEscopoQuery = useVendedoresEscopo();
  const opcoesVendedor = vendedoresEscopoQuery.data?.data ?? [];
  const mostrarFiltroVendedor = !(vendedoresEscopoQuery.data?.ehVendedorPuro ?? false);
  useVendedorPadrao(vendedoresEscopoQuery.data?.meuVendedorId, setVendedorId);

  const gridStart = useMemo(() => addDays(startOfMonth(mesAtual), -startOfMonth(mesAtual).getDay()), [mesAtual]);
  const gridEnd = useMemo(() => {
    const fim = endOfMonth(mesAtual);
    return addDays(fim, 6 - fim.getDay());
  }, [mesAtual]);
  const dias = useMemo(() => {
    const total = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1;
    return Array.from({ length: total }, (_, i) => addDays(gridStart, i));
  }, [gridStart, gridEnd]);

  const atividadesQuery = useResourceList<Atividade>("atividades", {
    dataInicio: toKey(gridStart),
    dataFim: toKey(gridEnd),
    pageSize: 100,
    sortBy: "dataVencimento",
    sortOrder: "asc",
    ...(vendedorId ? { vendedorId } : {}),
    ...(tipo !== "todos" ? { tipo } : {}),
    ...(somentePendentes ? { concluida: false } : {}),
  });

  // Orçamentos entram na Agenda pela data de criação — registro do que foi
  // feito naquele dia, ao lado dos agendamentos/atividades.
  const orcamentosQuery = useResourceList<Orcamento>("orcamentos", {
    dataInicio: toKey(gridStart),
    dataFim: toKey(gridEnd),
    pageSize: 100,
    sortBy: "createdAt",
    sortOrder: "asc",
    ...(vendedorId ? { vendedorId } : {}),
  });

  const isLoading = atividadesQuery.isLoading || orcamentosQuery.isLoading;

  const porDia = useMemo(() => {
    const mapa = new Map<string, AgendaItem[]>();
    const add = (key: string, item: AgendaItem) => {
      const lista = mapa.get(key) ?? [];
      lista.push(item);
      mapa.set(key, lista);
    };
    for (const a of atividadesQuery.data?.data ?? []) {
      if (!a.dataVencimento) continue;
      add(toKey(new Date(a.dataVencimento)), { kind: "atividade", id: a.id, data: a });
    }
    for (const o of orcamentosQuery.data?.data ?? []) {
      add(toKey(new Date(o.createdAt)), { kind: "orcamento", id: o.id, data: o });
    }
    return mapa;
  }, [atividadesQuery.data, orcamentosQuery.data]);

  const hoje = new Date();
  const filtrosAtivos = tipo !== "todos" || !!vendedorId;
  const limparFiltros = () => {
    setTipo("todos");
    setVendedorId(undefined);
  };

  const onSelectItem = (item: AgendaItem) => {
    if (item.kind === "atividade") router.push(`/crm/atividades/${item.id}`);
    else router.push(`/crm/orcamentos/${item.id}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold capitalize tracking-tight">
          {MESES[mesAtual.getMonth()]} de {mesAtual.getFullYear()}
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMesAtual((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" onClick={() => setMesAtual(startOfMonth(new Date()))}>
            Hoje
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMesAtual((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button onClick={() => router.push("/crm/atividades/novo")}>
            <Plus className="size-4" />
            Nova atividade
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <QuickFilterGroup>
          <QuickFilterButton active={somentePendentes} onClick={() => setSomentePendentes((v) => !v)}>
            <AlertTriangle className="size-3.5" />
            Somente pendentes
          </QuickFilterButton>
        </QuickFilterGroup>

        <FiltersPopover active={filtrosAtivos} onClear={limparFiltros}>
          <div className="space-y-2">
            <FieldLabel>Tipo</FieldLabel>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoFiltro)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {TIPOS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mostrarFiltroVendedor && (
            <div className="space-y-2">
              <FieldLabel>Vendedor</FieldLabel>
              <Select
                value={vendedorId ?? "none"}
                onValueChange={(v) => setVendedorId(v === "none" ? undefined : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Qualquer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Qualquer</SelectItem>
                  {opcoesVendedor.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nomeReduzido || v.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </FiltersPopover>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
        {DIAS_SEMANA.map((d) => (
          <div
            key={d}
            className="bg-muted px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
          >
            {d}
          </div>
        ))}
        {dias.map((dia) => (
          <DayCell
            key={toKey(dia)}
            dia={dia}
            noMes={dia.getMonth() === mesAtual.getMonth()}
            hoje={isSameDay(dia, hoje)}
            itens={porDia.get(toKey(dia)) ?? []}
            isLoading={isLoading}
            onSelectDia={() => router.push(`/crm/atividades/novo?data=${toKey(dia)}`)}
            onSelectItem={onSelectItem}
          />
        ))}
      </div>
    </div>
  );
}

function DayCell({
  dia,
  noMes,
  hoje,
  itens,
  isLoading,
  onSelectDia,
  onSelectItem,
}: {
  dia: Date;
  noMes: boolean;
  hoje: boolean;
  itens: AgendaItem[];
  isLoading: boolean;
  onSelectDia: () => void;
  onSelectItem: (item: AgendaItem) => void;
}) {
  const visiveis = itens.slice(0, MAX_VISIVEL);
  const resto = itens.length - visiveis.length;

  return (
    <div
      className={`flex min-h-28 flex-col gap-1 bg-background p-1.5 transition-colors hover:bg-muted/40 ${
        noMes ? "text-muted-foreground" : ""
      }`}
      onClick={onSelectDia}
      role="button"
    >
      <span
        className={`self-start text-xs ${
          hoje
            ? "flex size-5 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground"
            : "px-1"
        }`}
      >
        {dia.getDate()}
      </span>

      {isLoading ? (
        <Skeleton className="h-4 w-full" />
      ) : (
        <div className="flex flex-col gap-1">
          {visiveis.map((item) => (
            <AgendaItemChip key={`${item.kind}-${item.id}`} item={item} onSelect={() => onSelectItem(item)} />
          ))}
          {resto > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={(ev) => ev.stopPropagation()}
                  className="self-start text-xs text-muted-foreground hover:text-foreground"
                >
                  +{resto} mais
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-64 space-y-1 p-2"
                onClick={(ev) => ev.stopPropagation()}
              >
                {itens.map((item) => (
                  <AgendaItemChip
                    key={`${item.kind}-${item.id}`}
                    item={item}
                    onSelect={() => onSelectItem(item)}
                  />
                ))}
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}
    </div>
  );
}

function AgendaItemChip({ item, onSelect }: { item: AgendaItem; onSelect: () => void }) {
  const vencida = item.kind === "atividade" && estaVencida(item.data);
  const concluida = item.kind === "atividade" && item.data.concluida;
  const titulo = item.kind === "atividade" ? item.data.titulo : item.data.titulo;
  const cor = item.kind === "atividade" ? TIPO_COR[item.data.tipo] : STATUS_ORCAMENTO_COR[item.data.status];

  return (
    <button
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        onSelect();
      }}
      title={titulo}
      className={`flex w-full items-center gap-1.5 truncate rounded px-1 py-0.5 text-left text-xs hover:bg-muted ${
        concluida ? "text-muted-foreground line-through" : vencida ? "text-destructive" : ""
      }`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${cor}`} />
      <span className="truncate">{titulo}</span>
    </button>
  );
}
