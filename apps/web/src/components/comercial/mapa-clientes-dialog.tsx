"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import type {
  GeocodificacaoEmpresaLocal,
  PosicaoClienteMapa,
  PosicaoClienteMapaQuery,
} from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { coordenadaVazia } from "@/components/mapa/mapa-local";
import { COLORIR_POR, COR_LEAD, colorir, type ColorirPor } from "./mapa-clientes-cores";
import type { PinColorido } from "./mapa-clientes-leaflet";

// Leaflet mexe em `window` ao ser importado: só carrega no navegador.
const MapaClientesLeaflet = dynamic(() => import("./mapa-clientes-leaflet"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
});

const numero = (v: number) => v.toLocaleString("pt-BR");

type SituacaoFiltro = "todos" | "ativo" | "inativo" | "bloqueado";
type TipoPessoaFiltro = "todos" | "juridica" | "fisica";

const PREFERENCIA = "posicao-cliente:mapa";

/** Lembra no navegador como a pessoa deixou o mapa (cor e agrupar). */
function lerPreferencia(): { colorirPor: ColorirPor; agrupar: boolean } {
  const padrao = { colorirPor: "financeiro" as ColorirPor, agrupar: true };
  try {
    const salvo = JSON.parse(localStorage.getItem(PREFERENCIA) ?? "null");
    if (salvo && salvo.colorirPor in COLORIR_POR) {
      return { colorirPor: salvo.colorirPor, agrupar: salvo.agrupar !== false };
    }
  } catch {
    // Sem armazenamento (aba anônima, bloqueio): fica o padrão.
  }
  return padrao;
}
function gravarPreferencia(p: { colorirPor: ColorirPor; agrupar: boolean }) {
  try {
    localStorage.setItem(PREFERENCIA, JSON.stringify(p));
  } catch {
    // Idem: não lembrar não impede o uso.
  }
}

/**
 * Mapa da Posição de Cliente: os clientes filtrados na tela que têm
 * coordenadas. A cor conta o que se escolhe em "Colorir por" (financeiro,
 * situação, vendedor, dias sem compra, tipo de pessoa, ramo, curva ABC); a
 * legenda mostra quantos há de cada e, clicada, esconde ou mostra o grupo.
 * Pins próximos se agrupam (com o número) até o zoom separá-los. Os filtros
 * desta janela agem sobre o que já veio da tela, sem nova consulta.
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
    queryFn: () => apiFetch<PosicaoClienteMapa>("/clientes/posicao/mapa", { query: filtros }),
    enabled: aberto,
  });
  const { data: empresa } = useQuery({
    queryKey: ["geocodificacao", "empresa"],
    queryFn: () => apiFetch<GeocodificacaoEmpresaLocal>("/geocodificacao/empresa"),
    enabled: aberto,
    staleTime: 5 * 60_000,
  });

  const [preferencia, setPreferencia] = useState(lerPreferencia);
  const muda = (p: Partial<typeof preferencia>) => {
    const nova = { ...preferencia, ...p };
    setPreferencia(nova);
    gravarPreferencia(nova);
    if (p.colorirPor) setOcultos(new Set());
  };
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [leadsOcultos, setLeadsOcultos] = useState(false);
  const [situacao, setSituacao] = useState<SituacaoFiltro>("todos");
  const [tipoPessoa, setTipoPessoa] = useState<TipoPessoaFiltro>("todos");
  const [vendedor, setVendedor] = useState("todos");
  const [listaSemCoordenada, setListaSemCoordenada] = useState(false);

  const leads = data?.leads ?? [];

  // Todos os pontos, para o enquadramento não mudar ao filtrar ou esconder.
  const pontos = useMemo<Array<[number, number]>>(
    () => [
      ...(data?.pins ?? []).map((p) => [p.latitude, p.longitude] as [number, number]),
      ...(data?.leads ?? []).map((l) => [l.latitude, l.longitude] as [number, number]),
    ],
    [data],
  );

  const vendedores = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of data?.pins ?? []) if (p.vendedorId) m.set(p.vendedorId, p.vendedorNome ?? "—");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  // Filtros desta janela, antes da cor: a legenda conta o que sobrou.
  const filtrados = useMemo(
    () =>
      (data?.pins ?? []).filter(
        (p) =>
          (situacao === "todos" ||
            (situacao === "bloqueado"
              ? p.bloqueado
              : !p.bloqueado && p.ativo === (situacao === "ativo"))) &&
          (tipoPessoa === "todos" || p.tipoPessoa === tipoPessoa) &&
          (vendedor === "todos" ||
            (vendedor === "sem" ? !p.vendedorId : p.vendedorId === vendedor)),
      ),
    [data, situacao, tipoPessoa, vendedor],
  );

  const coloracao = useMemo(
    () => colorir(filtrados, preferencia.colorirPor),
    [filtrados, preferencia.colorirPor],
  );

  const itens = useMemo<PinColorido[]>(() => {
    const porChave = new Map(coloracao.grupos.map((g) => [g.chave, g]));
    return filtrados
      .map((pin) => {
        const g = porChave.get(coloracao.grupoDe.get(pin.id) ?? "");
        return g && !ocultos.has(g.chave) ? { pin, cor: g.cor, rotuloGrupo: g.rotulo } : null;
      })
      .filter((i): i is PinColorido => i !== null);
  }, [filtrados, coloracao, ocultos]);

  const alternar = (chave: string) =>
    setOcultos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });

  const semCoordenadas = data?.semCoordenadas ?? [];
  const totalSemCoordenadas = data ? data.totalFiltrados - data.pins.length : 0;
  const vazio = !!data && data.pins.length === 0 && leads.length === 0;
  const pontoEmpresa =
    empresa && !coordenadaVazia(empresa.latitude, empresa.longitude)
      ? { nome: empresa.nome, latitude: empresa.latitude!, longitude: empresa.longitude! }
      : null;

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100svh-2rem)] flex-col gap-3 sm:max-w-[min(1400px,calc(100%-2rem))]">
        <div className="pr-8">
          <DialogTitle>Mapa dos clientes</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {data ? (
              <>
                {numero(itens.length)} de {numero(data.pins.length)} cliente(s) no mapa
                {leads.length ? ` e ${numero(leads.length)} lead(s)` : ""}, com os filtros da tela
                {totalSemCoordenadas > 0 && !data.limitado && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setListaSemCoordenada((v) => !v)}
                    >
                      {numero(totalSemCoordenadas)} sem coordenadas
                    </button>
                  </>
                )}
              </>
            ) : (
              "Clientes filtrados na tela que têm coordenadas"
            )}
          </p>
          {data?.limitado && (
            <p className="text-xs text-destructive">
              Mais de {numero(data.pins.length)} clientes: o mapa mostra só os primeiros. Filtre mais
              (vendedor, UF, município) para ver todos.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Filtro
            rotulo="Colorir por"
            valor={preferencia.colorirPor}
            onChange={(v) => muda({ colorirPor: v as ColorirPor })}
            opcoes={Object.entries(COLORIR_POR).map(([v, r]) => ({ valor: v, rotulo: r }))}
            largura="w-56"
          />
          <Filtro
            rotulo="Situação"
            valor={situacao}
            onChange={(v) => setSituacao(v as SituacaoFiltro)}
            opcoes={[
              { valor: "todos", rotulo: "Todas" },
              { valor: "ativo", rotulo: "Ativos" },
              { valor: "inativo", rotulo: "Inativos" },
              { valor: "bloqueado", rotulo: "Bloqueados" },
            ]}
          />
          <Filtro
            rotulo="Pessoa"
            valor={tipoPessoa}
            onChange={(v) => setTipoPessoa(v as TipoPessoaFiltro)}
            opcoes={[
              { valor: "todos", rotulo: "Física e jurídica" },
              { valor: "juridica", rotulo: "Jurídica" },
              { valor: "fisica", rotulo: "Física" },
            ]}
            largura="w-40"
          />
          {vendedores.length > 1 && (
            <Filtro
              rotulo="Vendedor"
              valor={vendedor}
              onChange={setVendedor}
              opcoes={[
                { valor: "todos", rotulo: "Todos" },
                ...vendedores.map(([id, nome]) => ({ valor: id, rotulo: nome })),
                { valor: "sem", rotulo: "Sem vendedor" },
              ]}
              largura="w-56"
            />
          )}
          <label className="flex items-center gap-2">
            <Checkbox
              checked={preferencia.agrupar}
              onCheckedChange={(v) => muda({ agrupar: v === true })}
            />
            Agrupar pins próximos
          </label>
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
              itens={itens}
              leads={leadsOcultos ? [] : leads}
              pontos={pontos}
              agrupar={preferencia.agrupar}
              empresa={pontoEmpresa}
              onAbrirPosicao={onAbrirPosicao}
            />
          )}

          {listaSemCoordenada && (
            <div className="absolute top-2 left-2 z-[1000] flex max-h-[calc(100%-1rem)] w-80 flex-col rounded-lg border bg-background/95 text-xs shadow-md">
              <div className="flex items-center justify-between border-b p-2">
                <p className="font-medium">Sem coordenadas ({numero(totalSemCoordenadas)})</p>
                <button
                  type="button"
                  onClick={() => setListaSemCoordenada(false)}
                  className="rounded p-0.5 hover:bg-muted"
                  aria-label="Fechar lista"
                >
                  <X className="size-4" />
                </button>
              </div>
              <p className="border-b px-2 py-1.5 text-muted-foreground">
                Abra o cliente e use a aba Mapa para posicionar.
              </p>
              <div className="min-h-0 overflow-y-auto">
                {semCoordenadas.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onAbrirPosicao(c.id)}
                    className="block w-full border-b px-2 py-1.5 text-left last:border-b-0 hover:bg-muted"
                  >
                    <span className="font-medium">{c.razaoSocial}</span>
                    <span className="block text-muted-foreground">
                      {[c.endereco, c.municipio && `${c.municipio}${c.uf ? ` - ${c.uf}` : ""}`]
                        .filter(Boolean)
                        .join(" · ") || "sem endereço"}
                    </span>
                  </button>
                ))}
                {totalSemCoordenadas > semCoordenadas.length && (
                  <p className="p-2 text-muted-foreground">
                    Mostrando {numero(semCoordenadas.length)}. Filtre mais para ver os demais.
                  </p>
                )}
              </div>
            </div>
          )}

          {data && !vazio && (
            // z acima dos painéis do Leaflet (400–700).
            <div className="absolute right-2 bottom-6 z-[1000] max-h-[60%] w-72 space-y-0.5 overflow-y-auto rounded-lg border bg-background/95 p-2 text-xs shadow-md">
              <p className="mb-1 font-medium">{COLORIR_POR[preferencia.colorirPor]}</p>
              {coloracao.grupos.map((g) => (
                <button
                  key={g.chave}
                  type="button"
                  onClick={() => alternar(g.chave)}
                  title={ocultos.has(g.chave) ? "Mostrar no mapa" : "Esconder do mapa"}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted",
                    ocultos.has(g.chave) && "opacity-40 line-through",
                  )}
                >
                  <span
                    className="inline-block size-3 shrink-0 rounded-full border border-white"
                    style={{ background: g.cor }}
                  />
                  <span className="min-w-0 flex-1 truncate" title={g.rotulo}>
                    {g.rotulo}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{numero(g.total)}</span>
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
                  <span className="tabular-nums text-muted-foreground">{numero(leads.length)}</span>
                </button>
              )}
              {pontoEmpresa && (
                <p className="flex items-center gap-2 px-1 py-0.5 text-muted-foreground">
                  <span className="inline-block size-3 shrink-0 rounded-sm bg-slate-900 dark:border dark:border-white" />
                  {pontoEmpresa.nome}
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Filtro({
  rotulo,
  valor,
  onChange,
  opcoes,
  largura = "w-36",
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  opcoes: Array<{ valor: string; rotulo: string }>;
  largura?: string;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      <Select value={valor} onValueChange={onChange}>
        <SelectTrigger size="sm" className={largura}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z-[1100]">
          {opcoes.map((o) => (
            <SelectItem key={o.valor} value={o.valor}>
              {o.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
