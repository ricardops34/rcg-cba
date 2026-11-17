"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  SITUACAO_PIN_CLIENTE_ROTULO,
  type PosicaoClienteMapa,
  type PosicaoClienteMapaQuery,
  type SituacaoPinCliente,
} from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  COR_LEAD,
  COR_SITUACAO as COR,
  ORDEM_SITUACAO as ORDEM,
} from "./mapa-clientes-cores";

// Leaflet mexe em `window` ao ser importado: só carrega no navegador.
const MapaClientesLeaflet = dynamic(() => import("./mapa-clientes-leaflet"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
});

const numero = (v: number) => v.toLocaleString("pt-BR");

/**
 * Mapa da Posição de Cliente: os clientes filtrados na tela que têm
 * coordenadas, um pin por cliente com a cor da situação. A legenda no canto
 * mostra quantos há de cada e, clicada, esconde ou mostra aquele grupo.
 */
export function MapaClientesDialog({
  aberto,
  onOpenChange,
  filtros,
  onAbrirPosicao,
}: {
  aberto: boolean;
  onOpenChange: (aberto: boolean) => void;
  filtros: PosicaoClienteMapaQuery;
  onAbrirPosicao: (clienteId: string) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["clientes", "posicao", "mapa", filtros],
    queryFn: () =>
      apiFetch<PosicaoClienteMapa>("/clientes/posicao/mapa", { query: filtros }),
    enabled: aberto,
  });
  const [ocultos, setOcultos] = useState<Set<SituacaoPinCliente>>(new Set());
  const [leadsOcultos, setLeadsOcultos] = useState(false);
  const leads = data?.leads ?? [];

  // Todos os pontos, para o enquadramento não mudar ao esconder um grupo.
  const pontos = useMemo<Array<[number, number]>>(
    () => [
      ...(data?.pins ?? []).map((p) => [p.latitude, p.longitude] as [number, number]),
      ...(data?.leads ?? []).map((l) => [l.latitude, l.longitude] as [number, number]),
    ],
    [data],
  );

  const contagem = useMemo(() => {
    const c = Object.fromEntries(ORDEM.map((s) => [s, 0])) as Record<SituacaoPinCliente, number>;
    for (const p of data?.pins ?? []) c[p.situacao]++;
    return c;
  }, [data]);

  const visiveis = useMemo(
    () => (data?.pins ?? []).filter((p) => !ocultos.has(p.situacao)),
    [data, ocultos],
  );

  const alternar = (s: SituacaoPinCliente) =>
    setOcultos((atual) => {
      const novo = new Set(atual);
      if (novo.has(s)) novo.delete(s);
      else novo.add(s);
      return novo;
    });

  const semCoordenadas = data ? data.totalFiltrados - data.pins.length : 0;
  const vazio = !!data && data.pins.length === 0 && leads.length === 0;

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100svh-2rem)] flex-col gap-3 sm:max-w-[min(1400px,calc(100%-2rem))]">
        <div className="pr-8">
          <DialogTitle>Mapa dos clientes</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {data
              ? `${numero(data.pins.length)} cliente(s)` +
                (leads.length ? ` e ${numero(leads.length)} lead(s)` : "") +
                " no mapa, com os filtros da tela" +
                (semCoordenadas > 0 && !data.limitado
                  ? ` · ${numero(semCoordenadas)} sem coordenadas`
                  : "")
              : "Clientes filtrados na tela que têm coordenadas"}
          </p>
          {data?.limitado && (
            <p className="text-xs text-destructive">
              Mais de {numero(data.pins.length)} clientes: o mapa mostra só os primeiros. Filtre
              mais (vendedor, UF, município) para ver todos.
            </p>
          )}
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border">
          {isLoading ? (
            <Skeleton className="size-full" />
          ) : error ? (
            <p className="p-4 text-sm text-destructive">Não foi possível carregar o mapa.</p>
          ) : vazio ? (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhum cliente filtrado (nem lead aberto) tem coordenadas.
            </p>
          ) : (
            <MapaClientesLeaflet
              pins={visiveis}
              leads={leadsOcultos ? [] : leads}
              pontos={pontos}
              onAbrirPosicao={onAbrirPosicao}
            />
          )}

          {data && !vazio && (
            // z acima dos painéis do Leaflet (400–700).
            <div className="absolute right-2 bottom-6 z-[1000] space-y-0.5 rounded-lg border bg-background/95 p-2 text-xs shadow-md">
              <p className="mb-1 font-medium">Legenda</p>
              {ORDEM.filter((s) => contagem[s] > 0).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => alternar(s)}
                  title={ocultos.has(s) ? "Mostrar no mapa" : "Esconder do mapa"}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted",
                    ocultos.has(s) && "opacity-40 line-through",
                  )}
                >
                  <span
                    className="inline-block size-3 shrink-0 rounded-full border border-white"
                    style={{ background: COR[s] }}
                  />
                  <span className="flex-1">{SITUACAO_PIN_CLIENTE_ROTULO[s]}</span>
                  <span className="tabular-nums text-muted-foreground">{numero(contagem[s])}</span>
                </button>
              ))}
              {leads.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLeadsOcultos((v) => !v)}
                  title={leadsOcultos ? "Mostrar no mapa" : "Esconder do mapa"}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted",
                    leadsOcultos && "opacity-40 line-through",
                  )}
                >
                  <span
                    className="inline-block size-3 shrink-0 rounded-sm border border-white"
                    style={{ background: COR_LEAD }}
                  />
                  <span className="flex-1">Lead</span>
                  <span className="tabular-nums text-muted-foreground">
                    {numero(leads.length)}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
