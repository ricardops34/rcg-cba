import { createZodDto } from 'nestjs-zod';
import {
  equipamentoAplicacaoCriarSchema,
  equipamentoComodatoCriarSchema,
  equipamentoComodatoEditarSchema,
  equipamentoComodatoQuerySchema,
} from '@plataforma/contracts';

export class EquipamentoComodatoQueryDto extends createZodDto(
  equipamentoComodatoQuerySchema,
) {}
export class EquipamentoComodatoCriarDto extends createZodDto(
  equipamentoComodatoCriarSchema,
) {}
export class EquipamentoComodatoEditarDto extends createZodDto(
  equipamentoComodatoEditarSchema,
) {}
export class EquipamentoAplicacaoCriarDto extends createZodDto(
  equipamentoAplicacaoCriarSchema,
) {}
