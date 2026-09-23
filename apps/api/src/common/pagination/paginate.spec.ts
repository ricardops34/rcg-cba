import { buildPaginatedResult, paginationToSkipTake } from './paginate';

describe('paginationToSkipTake', () => {
  it('calcula skip/take a partir de page e pageSize', () => {
    expect(paginationToSkipTake({ page: 1, pageSize: 20, sortOrder: 'asc' })).toEqual({ skip: 0, take: 20 });
    expect(paginationToSkipTake({ page: 3, pageSize: 10, sortOrder: 'asc' })).toEqual({ skip: 20, take: 10 });
  });
});

describe('buildPaginatedResult', () => {
  it('monta o envelope de paginação com totalPages arredondado para cima', () => {
    const result = buildPaginatedResult(['a', 'b'], 45, { page: 2, pageSize: 20, sortOrder: 'asc' });
    expect(result).toEqual({
      data: ['a', 'b'],
      total: 45,
      page: 2,
      pageSize: 20,
      totalPages: 3,
    });
  });

  it('retorna totalPages mínimo de 1 mesmo sem resultados', () => {
    const result = buildPaginatedResult([], 0, { page: 1, pageSize: 20, sortOrder: 'asc' });
    expect(result.totalPages).toBe(1);
  });
});
