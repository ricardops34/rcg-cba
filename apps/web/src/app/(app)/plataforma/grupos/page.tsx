"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GrupoContexto } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { GrupoForm } from "@/components/crud/grupos-economicos";
import { PlataformaGuard } from "../plataforma-guard";

/**
 * Hierarquia Grupo econômico → Empresa. O grupo fica acima das empresas, então
 * o cadastro e a composição moram aqui, na administração da plataforma. O
 * administrador de cada empresa vê o grupo em Administração > Empresas e cuida
 * dos usuários; quem barra a composição para ele é a API
 * (`GruposEconomicosService.salvar`).
 */
export default function PlataformaGruposPage() {
  const [selecao, setSelecao] = useState<string | null | undefined>();
  const { data, error, isLoading } = useQuery({
    queryKey: ["grupos-economicos", "plataforma"],
    queryFn: () => apiFetch<GrupoContexto>("/grupos-economicos"),
  });
  const grupoId = selecao === undefined ? data?.grupos[0]?.id ?? null : selecao;
  const grupo = data?.grupos.find((g) => g.id === grupoId);

  return (
    <PlataformaGuard>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Grupos econômicos</h1>
          <p className="text-sm text-muted-foreground">
            O grupo reúne empresas. Os usuários do grupo podem ter acesso a todas elas com um só login.
          </p>
        </div>
        {error && <p role="alert" className="text-destructive">{error.message}</p>}
        {isLoading && <p>Carregando grupos…</p>}
        {data && (
          <>
            <div className="flex flex-wrap gap-2" aria-label="Escolher grupo">
              {data.grupos.map((g) => (
                <Button key={g.id} variant={grupoId === g.id ? "default" : "outline"} onClick={() => setSelecao(g.id)}>
                  {g.descricao} ({g.empresas.length})
                </Button>
              ))}
              <Button variant={grupoId === null ? "default" : "outline"} onClick={() => setSelecao(null)}>
                Novo grupo
              </Button>
            </div>
            <GrupoForm
              key={grupoId ?? "novo"}
              grupo={grupo}
              disponiveis={data.empresasDisponiveis}
              onSaved={setSelecao}
              rotaEmpresa={(id) => `/plataforma/empresas/${id}`}
              rotaVolta="/plataforma/grupos"
            />
          </>
        )}
      </div>
    </PlataformaGuard>
  );
}
