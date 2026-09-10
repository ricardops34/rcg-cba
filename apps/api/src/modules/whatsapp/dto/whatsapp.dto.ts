import { createZodDto } from 'nestjs-zod';
import {
  whatsappAgendarMensagemSchema,
  whatsappAgendarVisitaSchema,
  whatsappConectarSchema,
  whatsappConectarEmpresaSchema,
  whatsappConfigUpdateSchema,
  whatsappConversaQuerySchema,
  whatsappEnviarArquivoSchema,
  whatsappEnviarBoletoSchema,
  whatsappEnviarDanfeSchema,
  whatsappEnviarOrcamentoSchema,
  whatsappEnviarSchema,
  whatsappEnviarTemplateSchema,
  whatsappIniciarConversaSchema,
  whatsappMensagemQuerySchema,
  whatsappNovoOrcamentoSchema,
  whatsappReagirSchema,
  whatsappVincularSchema,
  whatsappRecadoCriarSchema,
} from '@plataforma/contracts';

export class WhatsappConfigUpdateDto extends createZodDto(
  whatsappConfigUpdateSchema,
) {}
export class WhatsappConectarDto extends createZodDto(whatsappConectarSchema) {}
export class WhatsappConectarEmpresaDto extends createZodDto(
  whatsappConectarEmpresaSchema,
) {}
export class WhatsappConversaQueryDto extends createZodDto(
  whatsappConversaQuerySchema,
) {}
export class WhatsappMensagemQueryDto extends createZodDto(
  whatsappMensagemQuerySchema,
) {}
export class WhatsappEnviarDto extends createZodDto(whatsappEnviarSchema) {}
export class WhatsappEnviarArquivoDto extends createZodDto(
  whatsappEnviarArquivoSchema,
) {}
export class WhatsappEnviarTemplateDto extends createZodDto(
  whatsappEnviarTemplateSchema,
) {}
export class WhatsappAgendarMensagemDto extends createZodDto(
  whatsappAgendarMensagemSchema,
) {}
export class WhatsappAgendarVisitaDto extends createZodDto(
  whatsappAgendarVisitaSchema,
) {}
export class WhatsappEnviarOrcamentoDto extends createZodDto(
  whatsappEnviarOrcamentoSchema,
) {}
export class WhatsappEnviarDanfeDto extends createZodDto(
  whatsappEnviarDanfeSchema,
) {}
export class WhatsappEnviarBoletoDto extends createZodDto(
  whatsappEnviarBoletoSchema,
) {}
export class WhatsappNovoOrcamentoDto extends createZodDto(
  whatsappNovoOrcamentoSchema,
) {}
export class WhatsappReagirDto extends createZodDto(whatsappReagirSchema) {}
export class WhatsappVincularDto extends createZodDto(whatsappVincularSchema) {}
export class WhatsappIniciarConversaDto extends createZodDto(
  whatsappIniciarConversaSchema,
) {}

export class WhatsappRecadoCriarDto extends createZodDto(
  whatsappRecadoCriarSchema,
) {}
