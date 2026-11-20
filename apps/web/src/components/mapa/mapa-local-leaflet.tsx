"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { CamadasBase } from "./camadas-base";

export type PontoMapa = { latitude: number; longitude: number };

export type ReferenciaMapa = PontoMapa & {
  tipo: "empresa" | "usuario";
  rotulo: string;
};

/** Pin em SVG (divIcon): as imagens padrão do Leaflet não resolvem no bundler do Next. */
function pino(cor: string, miolo: string) {
  return L.divIcon({
    className: "",
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 24 34"><path d="M12 33s11-11.6 11-21A11 11 0 0 0 1 12c0 9.4 11 21 11 21z" fill="${cor}" stroke="#fff" stroke-width="1.5"/>${miolo}</svg>`,
    iconSize: [28, 40],
    iconAnchor: [14, 39],
    tooltipAnchor: [0, -34],
  });
}

/** Empresa: quadrado (prédio); usuário: ponto azul, como nos apps de mapa. */
const ICONE_EMPRESA = pino("#475569", '<rect x="8" y="7.5" width="8" height="8" rx="1" fill="#fff"/>');
const ICONE_USUARIO = L.divIcon({
  className: "",
  html: '<div style="width:16px;height:16px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 2px rgba(37,99,235,.35)"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  tooltipAnchor: [0, -10],
});

function iconeAlvo(pendente: boolean) {
  // Pendente (ainda não gravado) em âmbar, para não parecer o que está no cadastro.
  return pino(pendente ? "#d97706" : "#dc2626", '<circle cx="12" cy="12" r="3.5" fill="#fff"/>');
}

/**
 * Enquadra o alvo e as referências. Só reenquadra quando o conjunto muda de
 * fato (chave textual) — arrastar o pin não deve mexer no zoom.
 */
function Enquadrar({ pontos, chave }: { pontos: PontoMapa[]; chave: string }) {
  const map = useMap();
  useEffect(() => {
    if (!pontos.length) return;
    if (pontos.length === 1) {
      map.setView([pontos[0].latitude, pontos[0].longitude], 16);
      return;
    }
    map.fitBounds(
      L.latLngBounds(pontos.map((p) => [p.latitude, p.longitude] as [number, number])),
      { padding: [40, 40], maxZoom: 16 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, chave]);
  return null;
}

/** A rota até o alvo: caminho pelas ruas, ou reta tracejada, e o ponto de partida. */
export type RotaLocal = {
  origem: [number, number];
  caminho: Array<[number, number]>;
  linhaReta: boolean;
};

const ICONE_PARTIDA = L.divIcon({
  className: "",
  html: '<div style="width:16px;height:16px;border-radius:4px;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  tooltipAnchor: [0, -8],
});

function CamadaRotaLocal({ rota }: { rota: RotaLocal }) {
  const map = useMap();
  useEffect(() => {
    const grupo = L.featureGroup([
      L.polyline(rota.caminho, {
        color: "#2563eb",
        weight: rota.linhaReta ? 3 : 5,
        opacity: 0.85,
        dashArray: rota.linhaReta ? "8 8" : undefined,
      }),
      L.marker(rota.origem, { icon: ICONE_PARTIDA }).bindTooltip("Partida"),
    ]);
    grupo.addTo(map);
    map.fitBounds(grupo.getBounds(), { padding: [40, 40], maxZoom: 16 });
    return () => {
      grupo.remove();
    };
  }, [map, rota]);
  return null;
}

function CliqueNoMapa({ onClique }: { onClique: (p: PontoMapa) => void }) {
  useMapEvents({
    click: (e) => onClique({ latitude: e.latlng.lat, longitude: e.latlng.lng }),
  });
  return null;
}

/**
 * O mapa de um lugar só (cliente, empresa): o pin do alvo, que se move com
 * clique ou arrastando quando `editavel`, e os pontos de referência.
 * Carregado só no navegador — ver `MapaLocal`.
 */
export default function MapaLocalLeaflet({
  alvo,
  rotuloAlvo,
  pendente,
  referencias,
  editavel,
  onMover,
  chaveEnquadramento,
  rota = null,
}: {
  rota?: RotaLocal | null;
  alvo: PontoMapa | null;
  rotuloAlvo: string;
  pendente: boolean;
  referencias: ReferenciaMapa[];
  editavel: boolean;
  onMover: (p: PontoMapa) => void;
  /** Muda quando o mapa deve reenquadrar (troca de alvo por busca, referência nova). */
  chaveEnquadramento: string;
}) {
  const pontos = useMemo(
    () => [...(alvo ? [alvo] : []), ...referencias],
    [alvo, referencias],
  );
  const icone = useMemo(() => iconeAlvo(pendente), [pendente]);

  return (
    <MapContainer
      center={[-15.78, -47.93]}
      zoom={4}
      className="size-full"
      scrollWheelZoom
    >
      <CamadasBase />
      <Enquadrar pontos={pontos} chave={chaveEnquadramento} />
      {editavel && <CliqueNoMapa onClique={onMover} />}
      {rota && <CamadaRotaLocal rota={rota} />}
      {referencias.map((r) => (
        <Marker
          key={r.tipo}
          position={[r.latitude, r.longitude]}
          icon={r.tipo === "empresa" ? ICONE_EMPRESA : ICONE_USUARIO}
          keyboard={false}
        >
          <Tooltip>{r.rotulo}</Tooltip>
        </Marker>
      ))}
      {alvo && (
        <Marker
          position={[alvo.latitude, alvo.longitude]}
          icon={icone}
          draggable={editavel}
          eventHandlers={{
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng();
              onMover({ latitude: p.lat, longitude: p.lng });
            },
          }}
        >
          <Tooltip>{rotuloAlvo}</Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}
