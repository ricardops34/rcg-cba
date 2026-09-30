"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { EmpresaForm } from "@/components/crud/empresa-form";

/**
 * `?grupo=<id>&volta=<rota>` vem do "Adicionar empresa" da tela do grupo
 * econômico: a empresa nasce no grupo e, ao salvar, volta para lá.
 */
function NovaEmpresa() {
  const params = useSearchParams();
  const grupo = params.get("grupo") ?? undefined;
  const volta = params.get("volta");
  // Só rota interna: o parâmetro vem da URL e não pode mandar para fora.
  const listRoute = volta?.startsWith("/") && !volta.startsWith("//") ? volta : undefined;
  return <EmpresaForm grupoEconomicoId={grupo} listRoute={listRoute} />;
}

export default function NovaEmpresaPage() {
  return (
    <Suspense>
      <NovaEmpresa />
    </Suspense>
  );
}
