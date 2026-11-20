"use client";

import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import L from "@/components/mapa/leaflet-global";
import "@geoman-io/leaflet-geoman-free";
import { useEffect, useRef } from "react";
import { MapContainer, useMap } from "react-leaflet";
import type {
  GeometriaRegiao,
  VendedorRegiao,
  VendedorRegiaoInvasao,
} from "@plataforma/contracts";
import { CamadasBase } from "@/components/mapa/camadas-base";

export type ModoMapaRegioes =
  | { tipo: "normal" }
  | { tipo: "desenhar" }
  | { tipo: "editar"; regiaoId: string };

const ICONE_INVASAO = L.divIcon({
  className: "",
  html: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="31" viewBox="0 0 24 34"><path d="M12 33s11-11.6 11-21A11 11 0 0 0 1 12c0 9.4 11 21 11 21z" fill="#dc2626" stroke="#fff" stroke-width="1.5"/><path d="M12 6v8M12 17.5v.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>',
  iconSize: [22, 31],
  iconAnchor: [11, 30],
  tooltipAnchor: [0, -26],
});

/** Geometria do GeoJSON gerado pelo Leaflet (Feature, FeatureCollection ou a própria). */
function geometriaDe(geojson: unknown): GeometriaRegiao | null {
  const g = geojson as {
    type?: string;
    geometry?: GeometriaRegiao;
    features?: Array<{ geometry?: GeometriaRegiao }>;
  };
  const geom =
    g.type === "FeatureCollection"
      ? g.features?.[0]?.geometry
      : g.type === "Feature"
        ? g.geometry
        : (g as GeometriaRegiao);
  return geom && (geom.type === "Polygon" || geom.type === "MultiPolygon") ? geom : null;
}

/**
 * As regiões, as invasões e o desenho (Geoman). As camadas são criadas direto
 * no Leaflet: a edição de vértices é do Geoman, que precisa da camada viva.
 */
function Camadas({
  regioes,
  invasoes,
  corDe,
  modo,
  foco,
  onDesenhado,
  editadoRef,
  onSelecionar,
}: {
  regioes: VendedorRegiao[];
  invasoes: VendedorRegiaoInvasao[];
  corDe: (vendedorId: string | null) => string;
  modo: ModoMapaRegioes;
  foco: { chave: number; bounds: L.LatLngBoundsExpression } | null;
  onDesenhado: (g: GeometriaRegiao) => void;
  editadoRef: React.MutableRefObject<(() => GeometriaRegiao | null) | null>;
  onSelecionar: (regiaoId: string) => void;
}) {
  const map = useMap();
  const camadas = useRef(new Map<string, L.GeoJSON>());
  const cbDesenhado = useRef(onDesenhado);
  const cbSelecionar = useRef(onSelecionar);
  useEffect(() => {
    cbDesenhado.current = onDesenhado;
    cbSelecionar.current = onSelecionar;
  }, [onDesenhado, onSelecionar]);

  useEffect(() => {
    map.pm.setLang("pt_br");
    map.pm.setGlobalOptions({ allowSelfIntersection: false, snappable: true });
  }, [map]);

  // Regiões: refeitas quando a lista ou as cores mudam.
  useEffect(() => {
    const grupo = L.featureGroup();
    const mapa = new Map<string, L.GeoJSON>();
    for (const r of regioes) {
      if (!r.geometria) continue;
      const cor = corDe(r.vendedorId);
      const camada = L.geoJSON(r.geometria as GeoJSON.Geometry, {
        style: {
          color: cor,
          weight: 2,
          fillColor: cor,
          fillOpacity: r.vendedorId ? 0.18 : 0.06,
          dashArray: r.vendedorId ? undefined : "6 6",
        },
        pmIgnore: true,
      });
      camada.bindTooltip(
        `<strong>${r.nome}</strong><br/>${r.vendedorNome ?? "Região livre"}`,
        { sticky: true },
      );
      camada.on("click", () => cbSelecionar.current(r.id));
      camada.addTo(grupo);
      mapa.set(r.id, camada);
    }
    grupo.addTo(map);
    camadas.current = mapa;
    return () => {
      grupo.remove();
    };
  }, [map, regioes, corDe]);

  // Pins das invasões.
  useEffect(() => {
    const grupo = L.layerGroup();
    for (const i of invasoes) {
      if (i.latitude == null || i.longitude == null) continue;
      L.marker([i.latitude, i.longitude], { icon: ICONE_INVASAO, pmIgnore: true })
        .bindTooltip(
          `<strong>${i.razaoSocial}</strong><br/>Carteira: ${i.vendedorNome}<br/>Região de: ${i.regioes
            .map((r) => r.vendedorNome)
            .join(", ")}`,
        )
        .addTo(grupo);
    }
    grupo.addTo(map);
    return () => {
      grupo.remove();
    };
  }, [map, invasoes]);

  // Modo: desenhar um polígono novo, ou editar os vértices de uma área.
  useEffect(() => {
    if (modo.tipo === "desenhar") {
      const aoCriar = (e: { layer: L.Layer }) => {
        const geom = geometriaDe((e.layer as L.Polygon).toGeoJSON());
        e.layer.remove();
        if (geom) cbDesenhado.current(geom);
      };
      map.on("pm:create", aoCriar);
      map.pm.enableDraw("Polygon", { finishOn: "dblclick" });
      return () => {
        map.off("pm:create", aoCriar);
        map.pm.disableDraw();
      };
    }
    if (modo.tipo === "editar") {
      const camada = camadas.current.get(modo.regiaoId);
      if (!camada) return;
      const editaveis: L.Layer[] = [];
      camada.eachLayer((l) => {
        (l as L.Polygon).pm.enable({ allowSelfIntersection: false });
        editaveis.push(l);
      });
      editadoRef.current = () => geometriaDe(camada.toGeoJSON());
      return () => {
        editaveis.forEach((l) => (l as L.Polygon).pm.disable());
        editadoRef.current = null;
      };
    }
  }, [map, modo, editadoRef]);

  useEffect(() => {
    if (foco) map.fitBounds(foco.bounds, { padding: [40, 40], maxZoom: 16 });
  }, [map, foco]);

  return null;
}

export default function RegioesMapaLeaflet(props: {
  regioes: VendedorRegiao[];
  invasoes: VendedorRegiaoInvasao[];
  corDe: (vendedorId: string | null) => string;
  modo: ModoMapaRegioes;
  foco: { chave: number; bounds: L.LatLngBoundsExpression } | null;
  centroInicial: [number, number] | null;
  onDesenhado: (g: GeometriaRegiao) => void;
  editadoRef: React.MutableRefObject<(() => GeometriaRegiao | null) | null>;
  onSelecionar: (regiaoId: string) => void;
}) {
  const { centroInicial, ...resto } = props;
  return (
    <MapContainer
      center={centroInicial ?? [-15.78, -47.93]}
      zoom={centroInicial ? 12 : 4}
      className="size-full"
      scrollWheelZoom
      doubleClickZoom={props.modo.tipo !== "desenhar"}
    >
      <CamadasBase />
      <Camadas {...resto} />
    </MapContainer>
  );
}
