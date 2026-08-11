import { createZodDto } from 'nestjs-zod';
import {
  consultaVendasClienteQuerySchema,
  consultaVendasProdutoQuerySchema,
  consultaVendasVendedorQuerySchema,
} from '@plataforma/contracts';

export class ConsultaVendasClienteQueryDto extends createZodDto(
  consultaVendasClienteQuerySchema,
) {}
export class ConsultaVendasVendedorQueryDto extends createZodDto(
  consultaVendasVendedorQuerySchema,
) {}
export class ConsultaVendasProdutoQueryDto extends createZodDto(
  consultaVendasProdutoQuerySchema,
) {}
