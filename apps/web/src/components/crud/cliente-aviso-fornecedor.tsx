"use client";

import { useQuery } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import type { ClienteFornecedorVinculo } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";

/**
 * O cliente também é fornecedor? (20/11/2026). Consulta pelo documento
 * digitado — vale na inclusão, antes de salvar. CNPJ mostra também a mesma
 * raiz (outra filial do grupo). Sem documento completo, não consulta.
 */
export function AvisoFornecedor({ documento }: { documento: string }) {
  const digitos = documento.replace(/\D/g, "");
  const completo = digitos.length === 11 || digitos.length === 14;
  const { data = [] } = useQuery({
    queryKey: ["clientes", "fornecedores-por-documento", digitos],
    queryFn: () =>
      apiFetch<ClienteFornecedorVinculo[]>(`/clientes/fornecedores-por-documento/${digitos}`),
    enabled: completo,
    staleTime: 60_000,
  });
  if (!completo || data.length === 0) return null;

  const mesmo = data.filter((f) => f.mesmoDocumento);
  const filiais = data.filter((f) => !f.mesmoDocumento);

  return (
    <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <Truck className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium">
          {mesmo.length
            ? "Este cliente também é fornecedor"
            : "Há fornecedor do mesmo grupo (outra filial)"}
        </p>
        {[...mesmo, ...filiais].map((f) => (
          <p key={f.id} className="text-xs">
            {f.codigoErp && <span className="font-mono">{f.codigoErp} · </span>}
            {f.razaoSocial}
            {f.municipio ? ` · ${f.municipio}${f.uf ? ` - ${f.uf}` : ""}` : ""}
            {!f.mesmoDocumento && " · outra filial"}
            {!f.ativo && " · inativo"}
          </p>
        ))}
      </div>
    </div>
  );
}
