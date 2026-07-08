import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

/**
 * Documenta os query params padrão de listagem paginada (page, pageSize,
 * search, sortBy, sortOrder) em endpoints que recebem PaginationQueryDto.
 */
export function ApiPaginationQuery() {
  return applyDecorators(
    ApiQuery({ name: 'page', required: false, example: 1, description: 'Página atual, começando em 1' }),
    ApiQuery({ name: 'pageSize', required: false, example: 20, description: 'Itens por página (máx. 100)' }),
    ApiQuery({ name: 'search', required: false, example: 'andrade', description: 'Busca textual livre' }),
    ApiQuery({ name: 'sortBy', required: false, example: 'nome', description: 'Campo para ordenação' }),
    ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], example: 'asc' }),
  );
}
