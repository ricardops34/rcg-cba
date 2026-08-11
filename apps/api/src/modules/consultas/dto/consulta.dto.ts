import { createZodDto } from 'nestjs-zod';
import {
  consultaVendasClienteQuerySchema,
  consultaVendasProdutoQuerySchema,
} from '@plataforma/contracts';

export class ConsultaVendasClienteQueryDto extends createZodDto(
  consultaVendasClienteQuerySchema,
) {}
export class ConsultaVendasProdutoQueryDto extends createZodDto(
  consultaVendasProdutoQuerySchema,
) {}
