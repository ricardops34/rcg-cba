"use client";

import { LayerGroup, LayersControl, TileLayer, useMapEvents } from "react-leaflet";

/**
 * Fundos do mapa (20/11/2026), com o seletor de camadas no canto. Todos sem
 * chave. Antes da produção, conferir as licenças de uso comercial do CARTO e
 * da Esri (docs/planos/2026-11-20-mapas-clientes-rotas.md); o servidor
 * público do OpenStreetMap pede uso moderado.
 */
const CAMADAS = {
  ruas: "Ruas",
  claro: "Claro",
  escuro: "Escuro",
  satelite: "Satélite",
  hibrido: "Satélite com nomes",
} as const;
type Camada = keyof typeof CAMADAS;

const CHAVE = "mapa:camada";
const ATRIB_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const ATRIB_CARTO = `${ATRIB_OSM} &copy; <a href="https://carto.com/attributions">CARTO</a>`;
const ATRIB_ESRI = "Imagens &copy; Esri, Maxar, Earthstar Geographics";
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";

function lerCamada(): Camada {
  try {
    const salva = localStorage.getItem(CHAVE);
    if (salva && salva in CAMADAS) return salva as Camada;
  } catch {
    // Sem armazenamento: fica o padrão.
  }
  return "ruas";
}

/** Lembra no navegador o último fundo escolhido, para todos os mapas. */
function LembrarCamada() {
  useMapEvents({
    baselayerchange: (e) => {
      const camada = (Object.keys(CAMADAS) as Camada[]).find((c) => CAMADAS[c] === e.name);
      if (!camada) return;
      try {
        localStorage.setItem(CHAVE, camada);
      } catch {
        // Idem.
      }
    },
  });
  return null;
}

export function CamadasBase() {
  const inicial = lerCamada();
  return (
    <>
      <LayersControl position="topright">
        <LayersControl.BaseLayer name={CAMADAS.ruas} checked={inicial === "ruas"}>
          <TileLayer
            attribution={ATRIB_OSM}
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name={CAMADAS.claro} checked={inicial === "claro"}>
          <TileLayer
            attribution={ATRIB_CARTO}
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name={CAMADAS.escuro} checked={inicial === "escuro"}>
          <TileLayer
            attribution={ATRIB_CARTO}
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name={CAMADAS.satelite} checked={inicial === "satelite"}>
          <TileLayer
            attribution={ATRIB_ESRI}
            url={`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`}
            maxNativeZoom={18}
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name={CAMADAS.hibrido} checked={inicial === "hibrido"}>
          <LayerGroup>
            <TileLayer
              attribution={ATRIB_ESRI}
              url={`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`}
              maxNativeZoom={18}
              maxZoom={19}
            />
            <TileLayer
              url={`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`}
              maxNativeZoom={18}
              maxZoom={19}
            />
            <TileLayer
              url={`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`}
              maxNativeZoom={18}
              maxZoom={19}
            />
          </LayerGroup>
        </LayersControl.BaseLayer>
      </LayersControl>
      <LembrarCamada />
    </>
  );
}
