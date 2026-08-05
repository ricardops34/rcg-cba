"use client";

import { useQuery } from "@tanstack/react-query";
import type { Vendedor } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";

export interface VendedoresEscopoResponse {
  data: (Vendedor & { totalClientes: number })[];
  restrito: boolean;
  ehVendedorPuro: boolean;
  /** Id do Vendedor vinculado ao usuário logado, ou null se não houver vínculo. */
  meuVendedorId: string | null;
}

/**
 * Vendedores dentro do escopo hierárquico do usuário logado — alimenta todo
 * Select/filtro de Vendedor do app (listas e formulários). Reaproveita o
 * cache entre telas via a mesma queryKey.
 *
 * `apenasComCliente`: só vendedores com pelo menos um cliente vinculado,
 * incluindo bloqueados (ativo:false) — usado no filtro rápido de vendedor da
 * Posição de Cliente. Sem esse parâmetro, comportamento padrão (só ativos,
 * sem exigir cliente) usado em todo o resto do app.
 *
 * `uf`/`municipio`: facetas irmãs já selecionadas no filtro (Posição de
 * Cliente) — restringem a lista a vendedores com cliente batendo com elas.
 */
export function useVendedoresEscopo(params?: {
  apenasComCliente?: boolean;
  uf?: string;
  municipio?: string;
}) {
  const apenasComCliente = params?.apenasComCliente ?? false;
  const uf = params?.uf;
  const municipio = params?.municipio;
  return useQuery({
    queryKey: ["clientes", "vendedores-escopo", apenasComCliente, uf, municipio],
    queryFn: () =>
      apiFetch<VendedoresEscopoResponse>("/clientes/vendedores-escopo", {
        query: { apenasComCliente: apenasComCliente || undefined, uf, municipio },
      }),
  });
}

/** Rótulo padrão dos selects de filtro de vendedor do sistema: nome + quantidade de clientes. */
export function vendedorFiltroLabel(v: Vendedor & { totalClientes: number }) {
  return `${v.nomeReduzido || v.nome} (${v.totalClientes})`;
}
