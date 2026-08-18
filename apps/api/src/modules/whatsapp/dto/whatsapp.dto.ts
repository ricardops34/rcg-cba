import { createZodDto } from 'nestjs-zod';
import {
  whatsappAgendarVisitaSchema,
  whatsappConectarSchema,
  whatsappConfigUpdateSchema,
  whatsappConversaQuerySchema,
  whatsappEnviarArquivoSchema,
  whatsappEnviarOrcamentoSchema,
  whatsappEnviarSchema,
  whatsappIniciarConversaSchema,
  whatsappMensagemQuerySchema,
  whatsappReagirSchema,
  whatsappVincularSchema,
} from '@plataforma/contracts';

export class WhatsappConfigUpdateDto extends createZodDto(
  whatsappConfigUpdateSchema,
) {}
export class WhatsappConectarDto extends createZodDto(whatsappConectarSchema) {}
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
export class WhatsappAgendarVisitaDto extends createZodDto(
  whatsappAgendarVisitaSchema,
) {}
export class WhatsappEnviarOrcamentoDto extends createZodDto(
  whatsappEnviarOrcamentoSchema,
) {}
export class WhatsappReagirDto extends createZodDto(whatsappReagirSchema) {}
export class WhatsappVincularDto extends createZodDto(whatsappVincularSchema) {}
export class WhatsappIniciarConversaDto extends createZodDto(
  whatsappIniciarConversaSchema,
) {}
