"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PosicaoClienteMapaQuery } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { useVendedoresEscopo } from "@/hooks/use-vendedores-escopo";
import { PosicaoClienteSheet } from "@/components/comercial/posicao-cliente-sheet";
import { Filtro, MapaClientesPainel } from "@/components/comercial/mapa-clientes-dialog";

const TODOS = "todos";

/**
 * Tela própria de mapa (20/11/2026, docs/planos/2026-11-20-mapas-clientes-rotas.md):
 * Comercial > Mapa de Clientes e Gerencial > Mapa e Rotas. Os filtros daqui
 * vão ao servidor (UF, município, vendedor, dias sem compra, Top N pelo
 * faturamento do período); o painel tem os de exibição. O vendedor vê só a
 * carteira dele — o escopo é do servidor.
 */
export function MapaClientesTela({
  titulo,
  descricao,
  mostrarInicial = "clientes",
}: {
  titulo: string;
  descricao: string;
  mostrarInicial?: "ambos" | "clientes" | "leads";
}) {
  const [uf, setUf] = useState(TODOS);
  const [municipio, setMunicipio] = useState(TODOS);
  const [vendedorId, setVendedorId] = useState(TODOS);
  const [dias, setDias] = useState(TODOS);
  const [topN, setTopN] = useState(TODOS);
  const [periodo, setPeriodo] = useState("12");
  const [posicaoId, setPosicaoId] = useState<string | null>(null);

  const valor = (v: string) => (v === TODOS ? undefined : v);

  const ufs = useQuery({
    queryKey: ["clientes", "ufs-escopo", valor(municipio), valor(vendedorId)],
    queryFn: () =>
      apiFetch<{ data: { uf: string; total: number }[] }>("/clientes/ufs-escopo", {
        query: { municipio: valor(municipio), vendedorId: valor(vendedorId) },
      }),
  });
  const municipios = useQuery({
    queryKey: ["clientes", "municipios-escopo", valor(uf), valor(vendedorId)],
    queryFn: () =>
      apiFetch<{ data: { municipio: string; total: number }[] }>("/clientes/municipios-escopo", {
        query: { uf: valor(uf), vendedorId: valor(vendedorId) },
      }),
  });
  const vendedores = useVendedoresEscopo({ apenasComCliente: true });

  const filtros = useMemo<PosicaoClienteMapaQuery>(
    () => ({
      ...(valor(uf) ? { uf } : {}),
      ...(valor(municipio) ? { municipio } : {}),
      ...(valor(vendedorId) ? { vendedorId } : {}),
      ...(valor(dias) ? { diasSemComprar: Number(dias) } : {}),
      ...(valor(topN) ? { topN: Number(topN) } : {}),
      periodoMeses: Number(periodo),
    }),
    [uf, municipio, vendedorId, dias, topN, periodo],
  );

  return (
    <div className="flex h-[calc(100svh-6rem)] flex-col gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{descricao}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Filtro
          rotulo="UF"
          valor={uf}
          onChange={(v) => {
            setUf(v);
            setMunicipio(TODOS);
          }}
          opcoes={[
            { valor: TODOS, rotulo: "Todas" },
            ...(ufs.data?.data ?? []).map((u) => ({ valor: u.uf, rotulo: `${u.uf} (${u.total})` })),
          ]}
          largura="w-28"
        />
        <Filtro
          rotulo="Cidade"
          valor={municipio}
          onChange={setMunicipio}
          opcoes={[
            { valor: TODOS, rotulo: "Todas" },
            ...(municipios.data?.data ?? []).map((m) => ({
              valor: m.municipio,
              rotulo: `${m.municipio} (${m.total})`,
            })),
          ]}
          largura="w-56"
        />
        {!vendedores.data?.restrito && (
          <Filtro
            rotulo="Vendedor"
            valor={vendedorId}
            onChange={setVendedorId}
            opcoes={[
              { valor: TODOS, rotulo: "Todos" },
              ...(vendedores.data?.data ?? []).map((v) => ({ valor: v.id, rotulo: v.nome })),
            ]}
            largura="w-56"
          />
        )}
        <Filtro
          rotulo="Sem compra há"
          valor={dias}
          onChange={setDias}
          opcoes={[
            { valor: TODOS, rotulo: "Qualquer" },
            { valor: "30", rotulo: "30+ dias" },
            { valor: "60", rotulo: "60+ dias" },
            { valor: "90", rotulo: "90+ dias" },
            { valor: "180", rotulo: "180+ dias" },
            { valor: "365", rotulo: "1 ano ou mais" },
          ]}
          largura="w-36"
        />
        <Filtro
          rotulo="Top"
          valor={topN}
          onChange={setTopN}
          opcoes={[
            { valor: TODOS, rotulo: "Todos" },
            { valor: "10", rotulo: "10 que mais compram" },
            { valor: "20", rotulo: "20 que mais compram" },
            { valor: "50", rotulo: "50 que mais compram" },
            { valor: "100", rotulo: "100 que mais compram" },
          ]}
          largura="w-48"
        />
        <Filtro
          rotulo="Período"
          valor={periodo}
          onChange={setPeriodo}
          opcoes={[
            { valor: "3", rotulo: "3 meses" },
            { valor: "6", rotulo: "6 meses" },
            { valor: "12", rotulo: "12 meses" },
            { valor: "24", rotulo: "24 meses" },
          ]}
          largura="w-32"
        />
      </div>

      <MapaClientesPainel
        filtros={filtros}
        onAbrirPosicao={setPosicaoId}
        mostrarInicial={mostrarInicial}
      />

      <PosicaoClienteSheet clienteId={posicaoId} onOpenChange={(a) => !a && setPosicaoId(null)} />
    </div>
  );
}
