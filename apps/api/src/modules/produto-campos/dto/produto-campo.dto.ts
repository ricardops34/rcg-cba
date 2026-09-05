import { createZodDto } from 'nestjs-zod';
import {
  produtoCampoCreateSchema,
  produtoCampoUpdateSchema,
  produtoCamposGravarSchema,
} from '@plataforma/contracts';

export class ProdutoCampoCreateDto extends createZodDto(
  produtoCampoCreateSchema,
) {}
export class ProdutoCampoUpdateDto extends createZodDto(
  produtoCampoUpdateSchema,
) {}
export class ProdutoCamposGravarDto extends createZodDto(
  produtoCamposGravarSchema,
) {}
