import { createZodDto } from 'nestjs-zod';
import {
  plataformaAdminPromoverSchema,
  plataformaAdminUpdateSchema,
  plataformaAuditoriaQuerySchema,
  plataformaEmpresaCreateSchema,
  plataformaEmpresaQuerySchema,
  plataformaSituacaoUpdateSchema,
  plataformaVincularAdminSchema,
} from '@plataforma/contracts';

export class PlataformaEmpresaQueryDto extends createZodDto(
  plataformaEmpresaQuerySchema,
) {}
export class PlataformaEmpresaCreateDto extends createZodDto(
  plataformaEmpresaCreateSchema,
) {}
export class PlataformaSituacaoUpdateDto extends createZodDto(
  plataformaSituacaoUpdateSchema,
) {}
export class PlataformaAdminUpdateDto extends createZodDto(
  plataformaAdminUpdateSchema,
) {}
export class PlataformaAdminPromoverDto extends createZodDto(
  plataformaAdminPromoverSchema,
) {}
export class PlataformaAuditoriaQueryDto extends createZodDto(
  plataformaAuditoriaQuerySchema,
) {}
export class PlataformaVincularAdminDto extends createZodDto(
  plataformaVincularAdminSchema,
) {}
