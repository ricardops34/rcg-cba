"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Loader2,
  MousePointerClick,
  Route,
  Save,
  Trash2,
  X,
} from "lucide-react";
import type {
  GeocodificacaoEmpresaLocal,
  RotaVisitaCalculo,
  RotaVisitaCreate,
  RotaVisitaDetalhe,
  RotaVisitaResumo,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { decodificarPolilinha } from "@/lib/polilinha";
import { useVendedoresEscopo } from "@/hooks/use-vendedores-escopo";
import { useAuthStore } from "@/stores/auth-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { coordenadaVazia } from "@/components/mapa/mapa-local";
import type { RotaNoMapa } from "@/components/comercial/mapa-clientes-leaflet";

export type ParadaEscolhida = {
  id: string;
  razaoSocial: string;
  latitude: number;
  longitude: number;
};

const erro = (e: unknown, padrao: string) => (e instanceof ApiError ? e.message : padrao);
const hoje = () => new Date().toLocaleDateString("sv-SE");
const km = (m: number | null) => (m == null ? "—" : `${(m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`);
const tempo = (s: number | null) => {
  if (s == null) return null;
  const h = Math.floor(s / 3600);
  const min = Math.round((s % 3600) / 60);
  return h ? `${h} h ${min} min` : `${min} min`;
};
const dataBr = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Links do Google Maps para navegar no celular. O link aceita poucas paradas
 * intermediárias, então a rota vai em trechos de até 10 pontos.
 */
function linksGoogleMaps(pontos: Array<[number, number]>): string[] {
  const trechos: string[] = [];
  for (let i = 0; i < pontos.length - 1; i += 9) {
    const trecho = pontos.slice(i, i + 10);
    const [origem, ...resto] = trecho;
    const destino = resto[resto.length - 1];
    const meio = resto.slice(0, -1);
    const p = (x: [number, number]) => `${x[0]},${x[1]}`;
    trechos.push(
      `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${p(origem)}&destination=${p(destino)}` +
        (meio.length ? `&waypoints=${meio.map(p).join("|")}` : ""),
    );
  }
  return trechos;
}

/**
 * Rotas de visita (Gerencial > Mapa e Rotas, 20/11/2026): escolher os clientes
 * no mapa, calcular (Google Routes quando ligado, senão por proximidade),
 * salvar — cada parada vira visita na Agenda do vendedor — e acompanhar.
 */
export function RotasPainel({
  montando,
  onMontandoChange,
  escolhidas,
  onEscolhidasChange,
  onRota,
}: {
  montando: boolean;
  onMontandoChange: (v: boolean) => void;
  escolhidas: ParadaEscolhida[];
  onEscolhidasChange: (v: ParadaEscolhida[]) => void;
  onRota: (r: RotaNoMapa | null) => void;
}) {
  const queryClient = useQueryClient();
  const podeMontar = useAuthStore((s) => s.hasPermission("mapa-rotas", "cadastrar"));
  const podeExcluir = useAuthStore((s) => s.hasPermission("mapa-rotas", "editar"));
  const vendedores = useVendedoresEscopo();
  const { data: empresa } = useQuery({
    queryKey: ["geocodificacao", "empresa"],
    queryFn: () => apiFetch<GeocodificacaoEmpresaLocal>("/geocodificacao/empresa"),
    staleTime: 5 * 60_000,
  });

  const [vendedorId, setVendedorId] = useState("");
  const [data, setData] = useState(hoje);
  const [nome, setNome] = useState("");
  const [partida, setPartida] = useState<"empresa" | "eu">("empresa");
  const [minhaPosicao, setMinhaPosicao] = useState<[number, number] | null>(null);
  const [retornar, setRetornar] = useState(true);
  const [calculo, setCalculo] = useState<RotaVisitaCalculo | null>(null);

  const origem = useMemo<[number, number] | null>(() => {
    if (partida === "eu") return minhaPosicao;
    return empresa && !coordenadaVazia(empresa.latitude, empresa.longitude)
      ? [empresa.latitude!, empresa.longitude!]
      : null;
  }, [partida, minhaPosicao, empresa]);

  /** As escolhidas na ordem do cálculo (ou na ordem em que foram escolhidas). */
  const ordenadas = useMemo(() => {
    if (!calculo) return escolhidas;
    const porId = new Map(escolhidas.map((e) => [e.id, e]));
    return calculo.clienteIds.map((id) => porId.get(id)).filter((e): e is ParadaEscolhida => !!e);
  }, [escolhidas, calculo]);

  const desenhar = (paradas: ParadaEscolhida[], c: RotaVisitaCalculo | null) => {
    if (!origem || !paradas.length) return onRota(null);
    onRota({
      origem,
      retornar,
      paradas: paradas.map((p) => ({ latitude: p.latitude, longitude: p.longitude, rotulo: p.razaoSocial })),
      caminho: c?.polilinha ? decodificarPolilinha(c.polilinha) : null,
    });
  };

  const mudarEscolhidas = (v: ParadaEscolhida[]) => {
    setCalculo(null);
    onRota(null);
    onEscolhidasChange(v);
  };

  const usarMinhaPosicao = () => {
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        setMinhaPosicao([p.coords.latitude, p.coords.longitude]);
        setPartida("eu");
        setCalculo(null);
      },
      () => toast.error("Não foi possível obter a sua localização"),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const calcular = useMutation({
    mutationFn: () =>
      apiFetch<RotaVisitaCalculo>("/rotas-visita/calcular", {
        method: "POST",
        body: {
          origem: { latitude: origem![0], longitude: origem![1] },
          clienteIds: escolhidas.map((e) => e.id),
          retornar,
        },
      }),
    onSuccess: (c) => {
      setCalculo(c);
      const porId = new Map(escolhidas.map((e) => [e.id, e]));
      desenhar(
        c.clienteIds.map((id) => porId.get(id)!).filter(Boolean),
        c,
      );
      if (c.aviso) toast.warning(c.aviso);
    },
    onError: (e) => toast.error(erro(e, "Não foi possível calcular a rota")),
  });

  const salvar = useMutation({
    mutationFn: () => {
      const vend = vendedores.data?.data.find((v) => v.id === vendedorId);
      const body: RotaVisitaCreate = {
        nome: nome.trim() || `Rota ${dataBr(data)}${vend ? ` — ${vend.nome}` : ""}`,
        vendedorId,
        data,
        origem: { latitude: origem![0], longitude: origem![1] },
        retornar,
        clienteIds: ordenadas.map((e) => e.id),
        calculadaPor: calculo!.calculadaPor,
        distanciaMetros: calculo!.distanciaMetros,
        duracaoSegundos: calculo!.duracaoSegundos,
        polilinha: calculo!.polilinha,
      };
      return apiFetch<RotaVisitaDetalhe>("/rotas-visita", { method: "POST", body });
    },
    onSuccess: (r) => {
      toast.success(`Rota salva: ${r.total} visita(s) na Agenda de ${r.vendedorNome}`);
      void queryClient.invalidateQueries({ queryKey: ["rotas-visita"] });
      setCalculo(null);
      setNome("");
      onEscolhidasChange([]);
      onRota(null);
      onMontandoChange(false);
    },
    onError: (e) => toast.error(erro(e, "Não foi possível salvar a rota")),
  });

  const mover = (i: number, d: -1 | 1) => {
    const lista = [...ordenadas];
    const j = i + d;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    // A ordem manual vale como cálculo em linha reta (sem caminho pelas ruas).
    const c: RotaVisitaCalculo | null = calculo
      ? { ...calculo, clienteIds: lista.map((e) => e.id), calculadaPor: "linha_reta", polilinha: null, duracaoSegundos: null }
      : null;
    setCalculo(c);
    desenhar(lista, c);
  };

  const pontosDaRota: Array<[number, number]> = origem
    ? [origem, ...ordenadas.map((e) => [e.latitude, e.longitude] as [number, number]), ...(retornar ? [origem] : [])]
    : [];

  return (
    <Tabs defaultValue="nova" className="flex min-h-0 flex-1 flex-col">
      <TabsList>
        <TabsTrigger value="nova">Nova rota</TabsTrigger>
        <TabsTrigger value="salvas">Rotas salvas</TabsTrigger>
      </TabsList>

      <TabsContent value="nova" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {!podeMontar ? (
          <p className="text-sm text-muted-foreground">Sem permissão para montar rotas.</p>
        ) : (
          <>
            <Button
              size="sm"
              variant={montando ? "default" : "outline"}
              onClick={() => onMontandoChange(!montando)}
            >
              <MousePointerClick className="size-4" />
              {montando ? "Escolhendo no mapa — clique para parar" : "Escolher clientes no mapa"}
            </Button>
            {montando && (
              <p className="text-xs text-muted-foreground">
                Clique nos pins para incluir ou tirar da rota. Use os filtros acima (vendedor, Top,
                dias sem compra) para achar os clientes.
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 space-y-1">
                <FieldLabel>Vendedor (Agenda)</FieldLabel>
                <Select value={vendedorId} onValueChange={setVendedorId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Escolha o vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {(vendedores.data?.data ?? [])
                      .filter((v) => v.ativo && v.totalClientes > 0)
                      .map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.nome}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <FieldLabel>Data</FieldLabel>
                <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
              <div className="space-y-1">
                <FieldLabel>Partida</FieldLabel>
                <Select
                  value={partida}
                  onValueChange={(v) => {
                    if (v === "eu") usarMinhaPosicao();
                    else {
                      setPartida("empresa");
                      setCalculo(null);
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="empresa">Empresa</SelectItem>
                    <SelectItem value="eu">Minha localização</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <FieldLabel>Nome (opcional)</FieldLabel>
                <Input
                  value={nome}
                  maxLength={100}
                  placeholder="Ex.: Zona Norte — terça"
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <Checkbox
                  checked={retornar}
                  onCheckedChange={(v) => {
                    setRetornar(v === true);
                    setCalculo(null);
                  }}
                />
                Voltar ao ponto de partida no fim
              </label>
            </div>
            {!origem && (
              <p className="text-xs text-destructive">
                {partida === "empresa"
                  ? "A empresa ainda não tem localização (Administração > Geolocalização)."
                  : "Sem a sua localização."}
              </p>
            )}

            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Paradas ({escolhidas.length})</span>
                {escolhidas.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => mudarEscolhidas([])}>
                    Limpar
                  </Button>
                )}
              </div>
              {ordenadas.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum cliente escolhido.</p>
              ) : (
                <ol className="space-y-1">
                  {ordenadas.map((e, i) => (
                    <li key={e.id} className="flex items-center gap-1 rounded border px-2 py-1 text-xs">
                      <span className="w-5 shrink-0 font-semibold tabular-nums">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{e.razaoSocial}</span>
                      {calculo && (
                        <>
                          <button type="button" className="rounded p-0.5 hover:bg-muted" onClick={() => mover(i, -1)} aria-label="Subir">
                            <ArrowUp className="size-3.5" />
                          </button>
                          <button type="button" className="rounded p-0.5 hover:bg-muted" onClick={() => mover(i, 1)} aria-label="Descer">
                            <ArrowDown className="size-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="rounded p-0.5 hover:bg-muted"
                        onClick={() => mudarEscolhidas(escolhidas.filter((x) => x.id !== e.id))}
                        aria-label="Tirar da rota"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {calculo && (
              <div className="space-y-1 rounded-lg border p-2 text-xs">
                <p>
                  <span className="font-medium">{km(calculo.distanciaMetros)}</span>
                  {tempo(calculo.duracaoSegundos) && ` · ${tempo(calculo.duracaoSegundos)} dirigindo`}
                  {" · "}
                  {calculo.calculadaPor === "google" ? "caminho pelo Google" : "em linha reta (aprox.)"}
                </p>
                {linksGoogleMaps(pontosDaRota).map((url, i, todos) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                    <ExternalLink className="size-3" />
                    Abrir no Google Maps{todos.length > 1 ? ` — trecho ${i + 1} de ${todos.length}` : ""}
                  </a>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                disabled={!origem || escolhidas.length === 0 || calcular.isPending}
                onClick={() => calcular.mutate()}
              >
                {calcular.isPending ? <Loader2 className="size-4 animate-spin" /> : <Route className="size-4" />}
                Calcular rota
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={!calculo || !vendedorId || !data || salvar.isPending}
                onClick={() => salvar.mutate()}
                title={!vendedorId ? "Escolha o vendedor" : undefined}
              >
                {salvar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Salvar na Agenda
              </Button>
            </div>
          </>
        )}
      </TabsContent>

      <TabsContent value="salvas" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <RotasSalvas onRota={onRota} podeExcluir={podeExcluir} />
      </TabsContent>
    </Tabs>
  );
}

function RotasSalvas({
  onRota,
  podeExcluir,
}: {
  onRota: (r: RotaNoMapa | null) => void;
  podeExcluir: boolean;
}) {
  const queryClient = useQueryClient();
  const de = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toLocaleDateString("sv-SE");
  }, []);
  const { data: rotas = [], isLoading } = useQuery({
    queryKey: ["rotas-visita", de],
    queryFn: () => apiFetch<RotaVisitaResumo[]>("/rotas-visita", { query: { de } }),
  });
  const [aberta, setAberta] = useState<string | null>(null);

  const abrir = async (id: string) => {
    try {
      const r = await apiFetch<RotaVisitaDetalhe>(`/rotas-visita/${id}`);
      setAberta(id);
      onRota({
        origem: [r.origemLatitude, r.origemLongitude],
        retornar: r.retornar,
        paradas: r.paradas
          .filter((p) => p.latitude != null && p.longitude != null)
          .map((p) => ({
            latitude: p.latitude!,
            longitude: p.longitude!,
            rotulo: `${p.razaoSocial}${p.feita ? " (visitado)" : ""}`,
            feita: p.feita,
          })),
        caminho: r.polilinha ? decodificarPolilinha(r.polilinha) : null,
      });
    } catch (e) {
      toast.error(erro(e, "Não foi possível abrir a rota"));
    }
  };

  const excluir = useMutation({
    mutationFn: (id: string) => apiFetch(`/rotas-visita/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Rota excluída (as visitas ainda não feitas saíram da Agenda)");
      setAberta(null);
      onRota(null);
      void queryClient.invalidateQueries({ queryKey: ["rotas-visita"] });
    },
    onError: (e) => toast.error(erro(e, "Não foi possível excluir")),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (rotas.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma rota nas últimas duas semanas nem adiante.</p>;
  }
  return (
    <>
      <p className="text-xs text-muted-foreground">
        Desde {dataBr(de)}. Visita feita = atividade concluída na Agenda.
      </p>
      {rotas.map((r) => (
        <div
          key={r.id}
          className={`rounded-md border p-2 text-xs ${aberta === r.id ? "border-primary bg-muted" : ""}`}
        >
          <button type="button" className="block w-full text-left" onClick={() => abrir(r.id)}>
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.nome}</span>
              <Badge variant={r.feitas === r.total ? "default" : "secondary"}>
                {r.feitas}/{r.total}
              </Badge>
            </span>
            <span className="block text-muted-foreground">
              {dataBr(r.data)} · {r.vendedorNome} · {km(r.distanciaMetros)}
              {tempo(r.duracaoSegundos) ? ` · ${tempo(r.duracaoSegundos)}` : ""}
            </span>
          </button>
          {podeExcluir && aberta === r.id && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-1 h-7 text-destructive"
              onClick={() => {
                if (confirm(`Excluir a rota "${r.nome}"? As visitas ainda não feitas saem da Agenda.`)) {
                  excluir.mutate(r.id);
                }
              }}
            >
              <Trash2 className="size-3.5" />
              Excluir rota
            </Button>
          )}
        </div>
      ))}
    </>
  );
}
