import type { PaginationQuery } from '@plataforma/contracts';

export function paginationToSkipTake(query: PaginationQuery) {
  return {
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  };
}

export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  query: PaginationQuery,
) {
  return {
    data,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
