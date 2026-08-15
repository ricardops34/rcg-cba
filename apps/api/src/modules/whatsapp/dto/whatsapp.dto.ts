import { createZodDto } from 'nestjs-zod';
import {
  whatsappConectarSchema,
  whatsappConfigUpdateSchema,
  whatsappConversaQuerySchema,
  whatsappEnviarSchema,
  whatsappMensagemQuerySchema,
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
export class WhatsappVincularDto extends createZodDto(whatsappVincularSchema) {}
