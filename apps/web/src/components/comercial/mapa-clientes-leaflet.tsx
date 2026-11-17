"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import {
  LEAD_SITUACAO_LABEL,
  LEAD_TEMPERATURA_LABEL,
  SITUACAO_PIN_CLIENTE_ROTULO,
  type PosicaoClienteMapaLead,
  type PosicaoClienteMapaPin,
  type SituacaoPinCliente,
} from "@plataforma/contracts";
import { dataCivilBr } from "@/lib/data";
import { COR_LEAD, COR_SITUACAO, ORDEM_SITUACAO } from "./mapa-clientes-cores";

/**
 * Pin em SVG (divIcon), sem as imagens padrão do Leaflet — elas dependem de
 * caminho de arquivo que o bundler do Next não resolve, e não mudam de cor.
 * Bloqueado leva um traço no lugar do ponto, para não depender só da cor.
 */
function iconeDoPin(situacao: SituacaoPinCliente) {
  const cor = COR_SITUACAO[situacao];
  const miolo =
    situacao === "bloqueado"
      ? '<rect x="7.5" y="10.5" width="9" height="3" rx="1" fill="#fff"/>'
      : '<circle cx="12" cy="12" r="3.5" fill="#fff"/>';
  return L.divIcon({
    className: "",
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="34" viewBox="0 0 24 34"><path d="M12 33s11-11.6 11-21A11 11 0 0 0 1 12c0 9.4 11 21 11 21z" fill="${cor}" stroke="#fff" stroke-width="1.5"/>${miolo}</svg>`,
    iconSize: [24, 34],
    iconAnchor: [12, 33],
    popupAnchor: [0, -30],
  });
}

/**
 * Lead tem outro formato (balão quadrado com estrela), não só outra cor: dá
 * para distinguir de cliente mesmo com as cores parecidas.
 */
function iconeDoLead() {
  return L.divIcon({
    className: "",
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="33" viewBox="0 0 26 33"><path d="M3 1h20a2 2 0 0 1 2 2v19a2 2 0 0 1-2 2h-6l-4 8-4-8H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z" fill="${COR_LEAD}" stroke="#fff" stroke-width="1.5"/><polygon points="13,5.5 15,10.2 20,10.6 16.2,13.9 17.4,18.8 13,16.2 8.6,18.8 9.8,13.9 6,10.6 11,10.2" fill="#fff"/></svg>`,
    iconSize: [26, 33],
    iconAnchor: [13, 32],
    popupAnchor: [0, -29],
  });
}

/**
 * Enquadra os pontos quando os dados mudam (filtro novo). Recebe todos os
 * pontos, não só os visíveis: esconder um grupo pela legenda não mexe no zoom.
 */
function Enquadrar({ pontos }: { pontos: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (!pontos.length) return;
    map.fitBounds(L.latLngBounds(pontos), { padding: [32, 32], maxZoom: 15 });
  }, [map, pontos]);
  return null;
}

function diasDesde(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * O mapa em si (Leaflet + OpenStreetMap). Carregado só no navegador — ver
 * `MapaClientesDialog`, que o importa com `ssr: false`.
 */
export default function MapaClientesLeaflet({
  pins,
  leads,
  pontos,
  onAbrirPosicao,
}: {
  pins: PosicaoClienteMapaPin[];
  leads: PosicaoClienteMapaLead[];
  pontos: Array<[number, number]>;
  onAbrirPosicao: (clienteId: string) => void;
}) {
  const iconeLead = useMemo(() => iconeDoLead(), []);
  const icones = useMemo(
    () =>
      Object.fromEntries(ORDEM_SITUACAO.map((s) => [s, iconeDoPin(s)])) as Record<
        SituacaoPinCliente,
        L.DivIcon
      >,
    [],
  );

  return (
    <MapContainer
      center={[-15.78, -47.93]}
      zoom={4}
      className="size-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <Enquadrar pontos={pontos} />
      {pins.map((p) => (
        <Marker
          key={p.id}
          position={[p.latitude, p.longitude]}
          icon={icones[p.situacao]}
          title={p.razaoSocial}
        >
          <Popup>
            <div className="min-w-48 space-y-1 text-xs">
              <p className="font-mono text-muted-foreground">{p.codigoErp ?? "sem código"}</p>
              <p className="text-sm font-semibold leading-tight">{p.razaoSocial}</p>
              {p.nomeFantasia && p.nomeFantasia !== p.razaoSocial && (
                <p className="text-muted-foreground">{p.nomeFantasia}</p>
              )}
              {p.municipio && (
                <p className="text-muted-foreground">
                  {p.municipio}
                  {p.uf ? ` - ${p.uf}` : ""}
                </p>
              )}
              <p>
                Última compra:{" "}
                {p.ultimaCompra ? (
                  <strong>
                    {dataCivilBr(p.ultimaCompra)} ({diasDesde(p.ultimaCompra)} dias)
                  </strong>
                ) : (
                  <strong>nunca comprou</strong>
                )}
              </p>
              <p className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ background: COR_SITUACAO[p.situacao] }}
                />
                {SITUACAO_PIN_CLIENTE_ROTULO[p.situacao]}
              </p>
              <button
                type="button"
                className="mt-1 font-medium text-primary hover:underline"
                onClick={() => onAbrirPosicao(p.id)}
              >
                Abrir posição do cliente
              </button>
            </div>
          </Popup>
        </Marker>
      ))}
      {leads.map((l) => (
        <Marker
          key={`lead-${l.id}`}
          position={[l.latitude, l.longitude]}
          icon={iconeLead}
          title={l.empresaInformada ?? l.nome ?? l.telefone}
        >
          <Popup>
            <div className="min-w-48 space-y-1 text-xs">
              <p className="font-medium" style={{ color: COR_LEAD }}>
                Lead · {LEAD_TEMPERATURA_LABEL[l.temperatura]} ·{" "}
                {LEAD_SITUACAO_LABEL[l.situacao]}
              </p>
              <p className="text-sm font-semibold leading-tight">
                {l.empresaInformada || l.nome || "Sem nome"}
              </p>
              {l.empresaInformada && l.nome && (
                <p className="text-muted-foreground">{l.nome}</p>
              )}
              <p className="font-mono text-muted-foreground">{l.telefone}</p>
              {l.municipio && (
                <p className="text-muted-foreground">
                  {l.municipio}
                  {l.uf ? ` - ${l.uf}` : ""}
                </p>
              )}
              <p>{l.interesse}</p>
              <p className="text-muted-foreground">
                {l.vendedorNome ? `Com ${l.vendedorNome}` : "Sem vendedor (na fila)"}
              </p>
              <a
                href={`/comercial/leads?lead=${l.id}`}
                className="mt-1 inline-block font-medium text-primary hover:underline"
              >
                Abrir leads
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
