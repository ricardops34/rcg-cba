import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  whatsappAgendarMensagemSchema,
  whatsappAtualizarAgendamentoSchema,
  whatsappAtualizarAtendimentoSchema,
  whatsappMarcarImportanteSchema,
  whatsappMarcarFixadaSchema,
  whatsappEtiquetaCreateSchema,
  whatsappEtiquetaUpdateSchema,
  whatsappDefinirEtiquetasSchema,
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
  roteiroParametrosSchema,
  roteiroGravarSchema,
  roteiroCancelarSchema,
  roteiroRemarcarSchema,
  roteiroItensQuerySchema,
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
export class WhatsappAtualizarAgendamentoDto extends createZodDto(
  whatsappAtualizarAgendamentoSchema,
) {}
export class WhatsappAtualizarAtendimentoDto extends createZodDto(
  whatsappAtualizarAtendimentoSchema,
) {}
export class WhatsappMarcarImportanteDto extends createZodDto(
  whatsappMarcarImportanteSchema,
) {}
export class WhatsappMarcarFixadaDto extends createZodDto(
  whatsappMarcarFixadaSchema,
) {}
export class WhatsappEtiquetaCreateDto extends createZodDto(
  whatsappEtiquetaCreateSchema,
) {}
export class WhatsappEtiquetaUpdateDto extends createZodDto(
  whatsappEtiquetaUpdateSchema,
) {}
export class WhatsappDefinirEtiquetasDto extends createZodDto(
  whatsappDefinirEtiquetasSchema,
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

export class RoteiroParametrosDto extends createZodDto(
  roteiroParametrosSchema,
) {}
export class RoteiroGravarDto extends createZodDto(roteiroGravarSchema) {}
export class RoteiroCancelarDto extends createZodDto(roteiroCancelarSchema) {}
export class RoteiroRemarcarDto extends createZodDto(roteiroRemarcarSchema) {}
export class RoteiroItensQueryDto extends createZodDto(
  roteiroItensQuerySchema,
) {}
