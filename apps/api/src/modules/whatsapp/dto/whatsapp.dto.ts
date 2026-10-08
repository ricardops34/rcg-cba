import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  whatsappAgendarMensagemSchema,
  whatsappAnotarSchema,
  whatsappAgendarVisitaSchema,
  whatsappConectarSchema,
  whatsappConectarEmpresaSchema,
  whatsappConfigUpdateSchema,
  whatsappTestarGatewaySchema,
  whatsappConversaQuerySchema,
  whatsappHistoricoConversaQuerySchema,
  whatsappEnviarArquivoSchema,
  whatsappEnviarBoletoSchema,
  whatsappEnviarDanfeSchema,
  whatsappEnviarOrcamentoSchema,
  whatsappEnviarSchema,
  whatsappEnviarInterativoSchema,
  whatsappEnviarTemplateSchema,
  whatsappIniciarConversaSchema,
  whatsappMensagemQuerySchema,
  whatsappNovoOrcamentoSchema,
  whatsappReagirSchema,
  whatsappEditarMensagemSchema,
  whatsappPresencaSchema,
  whatsappVincularSchema,
  whatsappRecadoCriarSchema,
  whatsappRecadoEditarSchema,
} from '@plataforma/contracts';

export class WhatsappConfigUpdateDto extends createZodDto(
  whatsappConfigUpdateSchema,
) {}
export class WhatsappTestarGatewayDto extends createZodDto(
  whatsappTestarGatewaySchema,
) {}
export class WhatsappConectarDto extends createZodDto(whatsappConectarSchema) {}

export class WhatsappConectarEmpresaDto extends createZodDto(
  whatsappConectarEmpresaSchema,
) {}
export class WhatsappConversaQueryDto extends createZodDto(
  whatsappConversaQuerySchema,
) {}
export class WhatsappHistoricoConversaQueryDto extends createZodDto(
  whatsappHistoricoConversaQuerySchema,
) {}
export class WhatsappMensagemQueryDto extends createZodDto(
  whatsappMensagemQuerySchema,
) {}
export class WhatsappEnviarDto extends createZodDto(whatsappEnviarSchema) {}
export class WhatsappEnviarInterativoDto extends createZodDto(
  whatsappEnviarInterativoSchema,
) {}
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
export class WhatsappEditarMensagemDto extends createZodDto(
  whatsappEditarMensagemSchema,
) {}
export class WhatsappPresencaDto extends createZodDto(whatsappPresencaSchema) {}
export class WhatsappVincularDto extends createZodDto(whatsappVincularSchema) {}
export class WhatsappIniciarConversaDto extends createZodDto(
  whatsappIniciarConversaSchema,
) {}

export class WhatsappRecadoCriarDto extends createZodDto(
  whatsappRecadoCriarSchema,
) {}

export class WhatsappRecadoEditarDto extends createZodDto(
  whatsappRecadoEditarSchema,
) {}

export class WhatsappAnotarDto extends createZodDto(whatsappAnotarSchema) {}
