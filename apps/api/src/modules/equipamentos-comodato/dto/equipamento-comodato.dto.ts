import { createZodDto } from 'nestjs-zod';
import {
  equipamentoAplicacaoCriarSchema,
  equipamentoAplicacaoLoteSchema,
  equipamentoComunsQuerySchema,
  equipamentoComodatoCriarSchema,
  equipamentoComodatoEditarSchema,
  equipamentoComodatoQuerySchema,
  equipamentoExcluirLoteSchema,
  equipamentoPopularSchema,
  equipamentoSugestoesQuerySchema,
} from '@plataforma/contracts';

export class EquipamentoPopularDto extends createZodDto(
  equipamentoPopularSchema,
) {}
export class EquipamentoExcluirLoteDto extends createZodDto(
  equipamentoExcluirLoteSchema,
) {}

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
export class EquipamentoComunsQueryDto extends createZodDto(
  equipamentoComunsQuerySchema,
) {}
export class EquipamentoSugestoesQueryDto extends createZodDto(
  equipamentoSugestoesQuerySchema,
) {}
export class EquipamentoAplicacaoLoteDto extends createZodDto(
  equipamentoAplicacaoLoteSchema,
) {}
