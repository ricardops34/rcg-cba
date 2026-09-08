import { createZodDto } from 'nestjs-zod';
import {
  consultaEvolucaoQuerySchema,
  consultaVendasCategoriaQuerySchema,
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
export class ConsultaVendasCategoriaQueryDto extends createZodDto(
  consultaVendasCategoriaQuerySchema,
) {}
export class ConsultaEvolucaoQueryDto extends createZodDto(
  consultaEvolucaoQuerySchema,
) {}
