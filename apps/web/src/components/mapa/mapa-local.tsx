"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  Crosshair,
  ExternalLink,
  Loader2,
  LocateFixed,
  MapPin,
  Route,
  Search,
  Undo2,
  X,
} from "lucide-react";
import {
  GEOCODIFICACAO_PRECISAO_ROTULO,
  type GeocodificacaoBuscar,
  type GeocodificacaoEmpresaLocal,
  type GeocodificacaoRota,
  type GeocodificacaoTesteResultado,
} from "@plataforma/contracts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { decodificarPolilinha } from "@/lib/polilinha";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { PontoMapa, ReferenciaMapa, RotaLocal } from "./mapa-local-leaflet";

// Leaflet mexe em `window` ao ser importado: só carrega no navegador.
const MapaLocalLeaflet = dynamic(() => import("./mapa-local-leaflet"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
});

/** Faltando ou 0/0 (o ERP grava 0 no campo vazio): não é um lugar. */
export function coordenadaVazia(lat: number | null | undefined, lng: number | null | undefined) {
  return lat == null || lng == null || (Number(lat) === 0 && Number(lng) === 0);
}

/** 6 casas ≈ 11 cm — o mesmo arredondamento da busca automática. */
const arredondar = (n: number) => Math.round(n * 1e6) / 1e6;

const mesmoPonto = (a: PontoMapa | null, b: PontoMapa | null) =>
  !!a && !!b && a.latitude === b.latitude && a.longitude === b.longitude;

/**
 * Mapa de um lugar (aba Mapa do cliente, local da empresa): mostra o pin
 * gravado, a empresa ativa e, se pedido, a localização de quem está usando.
 * Quem pode editar posiciona o pin (clique ou arrastando), usa a própria
 * localização ou busca pelo endereço; nada é gravado até "Gravar posição".
 */
export function MapaLocal({
  rotulo,
  latitude,
  longitude,
  endereco,
  podeEditar,
  onGravar,
  textoGravar = "Gravar posição",
  mostrarEmpresa = true,
  altura = "h-[420px]",
  permitirRota = true,
}: {
  /** "Calcular rota" da empresa ou de onde o usuário está até o lugar. */
  permitirRota?: boolean;
  rotulo: string;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  /** Endereço para "Buscar pelo endereço"; sem rua/cidade/UF o botão não aparece. */
  endereco?: Partial<GeocodificacaoBuscar> | null;
  podeEditar: boolean;
  onGravar: (p: PontoMapa) => Promise<void> | void;
  textoGravar?: string;
  mostrarEmpresa?: boolean;
  altura?: string;
}) {
  const gravado = useMemo<PontoMapa | null>(
    () =>
      coordenadaVazia(latitude, longitude)
        ? null
        : { latitude: Number(latitude), longitude: Number(longitude) },
    [latitude, longitude],
  );
  const [pendente, setPendente] = useState<PontoMapa | null>(null);
  const [usuario, setUsuario] = useState<PontoMapa | null>(null);
  const [localizando, setLocalizando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [gravando, setGravando] = useState(false);
  // Muda só quando o mapa deve reenquadrar (busca, localização), não ao arrastar.
  const [enquadrar, setEnquadrar] = useState(0);

  const { data: empresa } = useQuery({
    queryKey: ["geocodificacao", "empresa"],
    queryFn: () => apiFetch<GeocodificacaoEmpresaLocal>("/geocodificacao/empresa"),
    enabled: mostrarEmpresa,
    staleTime: 5 * 60_000,
  });

  const alvo = pendente ?? gravado;
  const mudou = !!pendente && !mesmoPonto(pendente, gravado);

  const referencias = useMemo<ReferenciaMapa[]>(() => {
    const r: ReferenciaMapa[] = [];
    if (mostrarEmpresa && empresa && !coordenadaVazia(empresa.latitude, empresa.longitude)) {
      r.push({
        tipo: "empresa",
        rotulo: empresa.nome,
        latitude: empresa.latitude!,
        longitude: empresa.longitude!,
      });
    }
    if (usuario) r.push({ tipo: "usuario", rotulo: "Você está aqui", ...usuario });
    return r;
  }, [empresa, mostrarEmpresa, usuario]);

  const mover = (p: PontoMapa) => {
    setRota(null);
    setPendente({ latitude: arredondar(p.latitude), longitude: arredondar(p.longitude) });
  };

  // "Calcular rota" (20/11/2026): da empresa ou de onde o usuário está até o
  // alvo. Pelo Google quando as rotas dele estão ligadas; senão linha reta.
  const [rota, setRota] = useState<{
    desenho: RotaLocal;
    resultado: GeocodificacaoRota;
    origem: PontoMapa;
    de: "empresa" | "eu";
  } | null>(null);
  const [calculandoRota, setCalculandoRota] = useState(false);
  const pontoEmpresa =
    empresa && !coordenadaVazia(empresa.latitude, empresa.longitude)
      ? { latitude: empresa.latitude!, longitude: empresa.longitude! }
      : null;

  const calcularRota = async (de: "empresa" | "eu") => {
    if (!alvo) return;
    const obterOrigem = (): Promise<PontoMapa | null> =>
      de === "empresa"
        ? Promise.resolve(pontoEmpresa)
        : new Promise((resolve) => {
            if (!("geolocation" in navigator)) return resolve(null);
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const p = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                setUsuario({ latitude: arredondar(p.latitude), longitude: arredondar(p.longitude) });
                resolve(p);
              },
              () => resolve(null),
              { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
            );
          });
    setCalculandoRota(true);
    try {
      const origem = await obterOrigem();
      if (!origem) {
        toast.error(
          de === "empresa"
            ? "A empresa ainda não tem localização (Administração > Geolocalização)."
            : "Não foi possível obter a sua localização. Libere o acesso no navegador.",
        );
        return;
      }
      const r = await apiFetch<GeocodificacaoRota>("/geocodificacao/rota", {
        method: "POST",
        body: { origem, destino: alvo },
      });
      setRota({
        resultado: r,
        origem,
        de,
        desenho: {
          origem: [origem.latitude, origem.longitude],
          caminho: r.polilinha
            ? decodificarPolilinha(r.polilinha)
            : [
                [origem.latitude, origem.longitude],
                [alvo.latitude, alvo.longitude],
              ],
          linhaReta: !r.polilinha,
        },
      });
      if (r.aviso) toast.warning(r.aviso);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível calcular a rota");
    } finally {
      setCalculandoRota(false);
    }
  };

  const enderecoCompleto =
    !!endereco?.endereco?.trim() && !!endereco?.municipio?.trim() && endereco?.uf?.trim().length === 2;

  const buscar = async () => {
    if (!endereco || !enderecoCompleto) return;
    setBuscando(true);
    try {
      const r = await apiFetch<GeocodificacaoTesteResultado>("/geocodificacao/buscar", {
        method: "POST",
        body: endereco,
      });
      if (r.encontrado && r.latitude != null && r.longitude != null) {
        setPendente({ latitude: r.latitude, longitude: r.longitude });
        setEnquadrar((n) => n + 1);
        const precisao = r.precisao ? GEOCODIFICACAO_PRECISAO_ROTULO[r.precisao] : null;
        toast.success(
          `Encontrado${precisao ? ` — ${precisao.toLowerCase()}` : ""}. Confira o pin e grave.`,
        );
      } else {
        toast.info("Endereço não encontrado com precisão. Posicione o pin no mapa.");
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível buscar o endereço");
    } finally {
      setBuscando(false);
    }
  };

  /** Posição do navegador; `usar` põe o pin do alvo nela. */
  const localizar = (usar: boolean) => {
    if (!("geolocation" in navigator)) {
      toast.error("Este navegador não informa a localização.");
      return;
    }
    setLocalizando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = {
          latitude: arredondar(pos.coords.latitude),
          longitude: arredondar(pos.coords.longitude),
        };
        setUsuario(p);
        if (usar) setPendente(p);
        setEnquadrar((n) => n + 1);
        setLocalizando(false);
        if (pos.coords.accuracy > 100) {
          toast.warning(
            `Localização aproximada (cerca de ${Math.round(pos.coords.accuracy)} m). Confira o pin.`,
          );
        }
      },
      (erro) => {
        setLocalizando(false);
        toast.error(
          erro.code === erro.PERMISSION_DENIED
            ? "A localização foi negada no navegador. Libere o acesso à localização para este site."
            : "Não foi possível obter a localização.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  };

  const gravar = async () => {
    if (!pendente) return;
    setGravando(true);
    try {
      await onGravar(pendente);
      setPendente(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível gravar a posição");
    } finally {
      setGravando(false);
    }
  };

  const chaveEnquadramento = `${gravado?.latitude},${gravado?.longitude}|${referencias.length}|${enquadrar}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {podeEditar && endereco && !gravado && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={buscar}
            disabled={!enderecoCompleto || buscando}
            title={enderecoCompleto ? undefined : "Preencha rua, cidade e UF no endereço"}
          >
            {buscando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Buscar pelo endereço
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => localizar(false)}
          disabled={localizando}
        >
          {localizando ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
          Minha localização
        </Button>
        {podeEditar && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => localizar(true)}
            disabled={localizando}
            title="Grava a sua posição atual como a do lugar — use quando estiver nele"
          >
            <Crosshair className="size-4" />
            Usar minha localização
          </Button>
        )}
        {permitirRota && alvo && !mudou && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" disabled={calculandoRota}>
                {calculandoRota ? <Loader2 className="size-4 animate-spin" /> : <Route className="size-4" />}
                Calcular rota
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem disabled={!pontoEmpresa} onSelect={() => calcularRota("empresa")}>
                <Building2 className="size-4" />
                Da empresa até aqui
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => calcularRota("eu")}>
                <LocateFixed className="size-4" />
                De onde estou até aqui
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {rota && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setRota(null)}>
            <X className="size-4" />
            Tirar rota
          </Button>
        )}
        {mudou && (
          <div className="ml-auto flex gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setPendente(null)}>
              <Undo2 className="size-4" />
              Descartar
            </Button>
            <Button type="button" size="sm" onClick={gravar} disabled={gravando}>
              {gravando ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
              {textoGravar}
            </Button>
          </div>
        )}
      </div>

      {/* isolate: os z-index do Leaflet (400–1000) não passam por cima do menu. */}
      <div className={`relative isolate overflow-hidden rounded-lg border ${altura}`}>
        <MapaLocalLeaflet
          alvo={alvo}
          rotuloAlvo={rotulo}
          pendente={mudou}
          referencias={referencias}
          editavel={podeEditar}
          onMover={mover}
          chaveEnquadramento={chaveEnquadramento}
          rota={rota?.desenho ?? null}
        />
      </div>

      {rota && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-2 text-sm">
          <Route className="size-4 text-primary" />
          <span className="font-medium">
            {(rota.resultado.distanciaMetros / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km
          </span>
          {rota.resultado.duracaoSegundos != null && (
            <span>
              {Math.round(rota.resultado.duracaoSegundos / 60) >= 60
                ? `${Math.floor(rota.resultado.duracaoSegundos / 3600)} h ${Math.round((rota.resultado.duracaoSegundos % 3600) / 60)} min`
                : `${Math.round(rota.resultado.duracaoSegundos / 60)} min`}{" "}
              de carro
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {rota.de === "empresa" ? "da empresa" : "de onde você está"} ·{" "}
            {rota.resultado.calculadaPor === "google" ? "pelas ruas (Google)" : "em linha reta"}
          </span>
          {alvo && (
            <a
              className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
              href={`https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${rota.origem.latitude},${rota.origem.longitude}&destination=${alvo.latitude},${alvo.longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="size-3" />
              Navegar no Google Maps
            </a>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {alvo ? (
            <>
              <span className="tabular-nums">
                {alvo.latitude}, {alvo.longitude}
              </span>
              {mudou && <span className="ml-1 text-amber-600 dark:text-amber-400">(não gravada)</span>}
              <a
                className="ml-2 text-primary hover:underline"
                href={`https://www.google.com/maps?q=${alvo.latitude},${alvo.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir no Google Maps
              </a>
            </>
          ) : podeEditar ? (
            "Sem coordenada. Clique no mapa para posicionar o pin, busque pelo endereço ou use a sua localização."
          ) : (
            "Sem coordenada."
          )}
        </span>
        {podeEditar && alvo && <span>Clique no mapa ou arraste o pin para ajustar.</span>}
        {mostrarEmpresa && empresa && coordenadaVazia(empresa.latitude, empresa.longitude) && (
          <span>
            A empresa ainda não tem localização (Administração &gt; Geolocalização).
          </span>
        )}
      </div>
    </div>
  );
}
