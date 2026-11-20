"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "@/components/mapa/leaflet-global";
import "leaflet.markercluster";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, Tooltip, useMap } from "react-leaflet";
import { CamadasBase } from "@/components/mapa/camadas-base";
import {
  LEAD_SITUACAO_LABEL,
  LEAD_TEMPERATURA_LABEL,
  type PosicaoClienteMapaLead,
  type PosicaoClienteMapaPin,
} from "@plataforma/contracts";
import { dataCivilBr } from "@/lib/data";
import { COR_LEAD } from "./mapa-clientes-cores";

export type PinColorido = { pin: PosicaoClienteMapaPin; cor: string; rotuloGrupo: string };

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Pin em SVG (divIcon), sem as imagens padrão do Leaflet — elas dependem de
 * caminho de arquivo que o bundler do Next não resolve, e não mudam de cor.
 * Bloqueado leva um traço no lugar do ponto, para não depender só da cor.
 */
const icones = new Map<string, L.DivIcon>();
function iconeDoPin(cor: string, bloqueado: boolean) {
  const chave = `${cor}|${bloqueado}`;
  let icone = icones.get(chave);
  if (!icone) {
    const miolo = bloqueado
      ? '<rect x="7.5" y="10.5" width="9" height="3" rx="1" fill="#fff"/>'
      : '<circle cx="12" cy="12" r="3.5" fill="#fff"/>';
    icone = L.divIcon({
      className: "",
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="34" viewBox="0 0 24 34"><path d="M12 33s11-11.6 11-21A11 11 0 0 0 1 12c0 9.4 11 21 11 21z" fill="${cor}" stroke="#fff" stroke-width="1.5"/>${miolo}</svg>`,
      iconSize: [24, 34],
      iconAnchor: [12, 33],
      popupAnchor: [0, -30],
    });
    icones.set(chave, icone);
  }
  return icone;
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

const ICONE_EMPRESA = L.divIcon({
  className: "",
  html: '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 24 34"><path d="M12 33s11-11.6 11-21A11 11 0 0 0 1 12c0 9.4 11 21 11 21z" fill="#0f172a" stroke="#fff" stroke-width="1.5"/><rect x="8" y="7.5" width="8" height="8" rx="1" fill="#fff"/></svg>',
  iconSize: [30, 42],
  iconAnchor: [15, 41],
  tooltipAnchor: [0, -36],
});

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

/**
 * Os pins dos clientes, criados direto no Leaflet: com mais de mil, um
 * componente React por pin pesa, e o agrupamento (markercluster) é uma camada
 * do Leaflet. O clique abre o balão, que é React (ver `Selecionado`).
 */
function CamadaClientes({
  itens,
  agrupar,
  onClique,
}: {
  itens: PinColorido[];
  agrupar: boolean;
  onClique: (pin: PosicaoClienteMapaPin) => void;
}) {
  const map = useMap();
  const cliqueRef = useRef(onClique);
  useEffect(() => {
    cliqueRef.current = onClique;
  }, [onClique]);

  useEffect(() => {
    const camada: L.LayerGroup = agrupar
      ? L.markerClusterGroup({
          chunkedLoading: true,
          showCoverageOnHover: false,
          maxClusterRadius: 50,
          disableClusteringAtZoom: 17,
          spiderfyOnMaxZoom: true,
        })
      : L.layerGroup();
    const marcadores = itens.map(({ pin, cor }) => {
      const m = L.marker([pin.latitude, pin.longitude], {
        icon: iconeDoPin(cor, pin.bloqueado),
        title: pin.razaoSocial,
      });
      m.on("click", () => cliqueRef.current(pin));
      return m;
    });
    if (agrupar) (camada as L.MarkerClusterGroup).addLayers(marcadores);
    else marcadores.forEach((m) => camada.addLayer(m));
    map.addLayer(camada);
    return () => {
      map.removeLayer(camada);
    };
  }, [map, itens, agrupar]);
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
  itens,
  leads,
  pontos,
  agrupar,
  empresa,
  onAbrirPosicao,
}: {
  itens: PinColorido[];
  leads: PosicaoClienteMapaLead[];
  pontos: Array<[number, number]>;
  agrupar: boolean;
  empresa: { nome: string; latitude: number; longitude: number } | null;
  onAbrirPosicao: (clienteId: string) => void;
}) {
  const iconeLead = useMemo(() => iconeDoLead(), []);
  const [selecionado, setSelecionado] = useState<PosicaoClienteMapaPin | null>(null);
  const grupoDe = useMemo(
    () => new Map(itens.map((i) => [i.pin.id, { cor: i.cor, rotulo: i.rotuloGrupo }])),
    [itens],
  );
  const grupoSelecionado = selecionado ? grupoDe.get(selecionado.id) : undefined;

  return (
    <MapContainer center={[-15.78, -47.93]} zoom={4} className="size-full" scrollWheelZoom>
      <CamadasBase />
      <Enquadrar pontos={pontos} />
      <CamadaClientes itens={itens} agrupar={agrupar} onClique={setSelecionado} />

      {empresa && (
        <Marker position={[empresa.latitude, empresa.longitude]} icon={ICONE_EMPRESA} zIndexOffset={1000}>
          <Tooltip>{empresa.nome}</Tooltip>
        </Marker>
      )}

      {selecionado && (
        <Popup
          position={[selecionado.latitude, selecionado.longitude]}
          offset={[0, -30]}
          eventHandlers={{ remove: () => setSelecionado(null) }}
        >
          <div className="min-w-56 space-y-1 text-xs">
            <p className="font-mono text-muted-foreground">{selecionado.codigoErp ?? "sem código"}</p>
            <p className="text-sm font-semibold leading-tight">{selecionado.razaoSocial}</p>
            {selecionado.nomeFantasia && selecionado.nomeFantasia !== selecionado.razaoSocial && (
              <p className="text-muted-foreground">{selecionado.nomeFantasia}</p>
            )}
            {selecionado.municipio && (
              <p className="text-muted-foreground">
                {selecionado.municipio}
                {selecionado.uf ? ` - ${selecionado.uf}` : ""}
                {" · "}
                {selecionado.tipoPessoa === "fisica" ? "Pessoa física" : "Pessoa jurídica"}
              </p>
            )}
            <p>
              Vendedor: <strong>{selecionado.vendedorNome ?? "sem vendedor"}</strong>
            </p>
            <p>
              Última compra:{" "}
              {selecionado.ultimaCompra ? (
                <strong>
                  {dataCivilBr(selecionado.ultimaCompra)} ({diasDesde(selecionado.ultimaCompra)} dias)
                </strong>
              ) : (
                <strong>nunca comprou</strong>
              )}
            </p>
            <p>
              Venda 12 meses: <strong>{moeda(selecionado.venda12Meses)}</strong>
            </p>
            {selecionado.cnaeDescricao && (
              <p className="text-muted-foreground">
                {selecionado.cnaeCodigo} {selecionado.cnaeDescricao}
              </p>
            )}
            {grupoSelecionado && (
              <p className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ background: grupoSelecionado.cor }}
                />
                {grupoSelecionado.rotulo}
              </p>
            )}
            <button
              type="button"
              className="mt-1 font-medium text-primary hover:underline"
              onClick={() => onAbrirPosicao(selecionado.id)}
            >
              Abrir posição do cliente
            </button>
          </div>
        </Popup>
      )}

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
                Lead · {LEAD_TEMPERATURA_LABEL[l.temperatura]} · {LEAD_SITUACAO_LABEL[l.situacao]}
              </p>
              <p className="text-sm font-semibold leading-tight">
                {l.empresaInformada || l.nome || "Sem nome"}
              </p>
              {l.empresaInformada && l.nome && <p className="text-muted-foreground">{l.nome}</p>}
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
