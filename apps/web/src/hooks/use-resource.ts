"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaginationQuery } from "@plataforma/contracts";
import { apiFetch } from "@/lib/api-client";

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function useResourceList<T>(
  resource: string,
  // Além dos campos de paginação/busca/ordenação, aceita filtros extras
  // específicos de cada recurso (ex.: ativo, papel, perfilId).
  query: Partial<PaginationQuery> & Record<string, string | number | boolean | undefined>,
) {
  return useQuery({
    queryKey: [resource, "list", query],
    queryFn: () =>
      apiFetch<PaginatedResponse<T>>(`/${resource}`, {
        query: query as Record<string, string | number | boolean | undefined>,
      }),
    placeholderData: (prev) => prev,
  });
}

export function useResourceMutations<TCreate, TUpdate>(resource: string) {
  const queryClient = useQueryClient();
  /**
   * Invalida **tudo** do recurso, não só a listagem.
   *
   * Era `[resource, "list"]`, e a consequência aparecia como "não salvou": as
   * telas de edição buscam o registro por `[resource, id]`, que ficava de fora
   * da invalidação. Com o `staleTime` de 30 s do QueryClient, reabrir o mesmo
   * cadastro logo depois de gravar devolvia o cache **anterior** — o valor
   * novo estava no banco, mas a tela mostrava o antigo.
   *
   * A chave-prefixo cobre lista, detalhe e os selects que o mesmo recurso
   * alimenta em outras telas.
   */
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [resource] });

  const create = useMutation({
    mutationFn: (input: TCreate) => apiFetch(`/${resource}`, { method: "POST", body: input }),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: TUpdate }) =>
      apiFetch(`/${resource}/${id}`, { method: "PATCH", body: input }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/${resource}/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
