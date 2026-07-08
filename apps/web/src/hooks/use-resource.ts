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
  query: Partial<PaginationQuery>,
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
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [resource, "list"] });

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
