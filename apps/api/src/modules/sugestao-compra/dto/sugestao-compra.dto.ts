import { createZodDto } from 'nestjs-zod';
import {
  sugestaoCompraGerarClienteBodySchema,
  sugestaoCompraGerarLoteBodySchema,
  sugestaoCompraListQuerySchema,
  sugestaoCompraQuerySchema,
} from '@plataforma/contracts';

export class SugestaoCompraQueryDto extends createZodDto(
  sugestaoCompraQuerySchema,
) {}

export class SugestaoCompraListQueryDto extends createZodDto(
  sugestaoCompraListQuerySchema,
) {}

export class SugestaoCompraGerarClienteBodyDto extends createZodDto(
  sugestaoCompraGerarClienteBodySchema,
) {}

export class SugestaoCompraGerarLoteBodyDto extends createZodDto(
  sugestaoCompraGerarLoteBodySchema,
) {}
