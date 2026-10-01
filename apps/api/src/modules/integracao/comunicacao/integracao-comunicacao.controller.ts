import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IntegracaoComunicacaoService } from './integracao-comunicacao.service';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';

@ApiTags('comunicacao')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/comunicacao')
export class IntegracaoComunicacaoController {
  constructor(private readonly service: IntegracaoComunicacaoService) {}

  @ApiOperation({
    summary: 'Registrar a comunicação do ERP',
    description:
      'Chamado no fim de cada execução de envio e de retorno de dados. Grava ' +
      'a data e hora do servidor da plataforma no parâmetro ' +
      'ULTIMA_COMUNICACAO_ERP da empresa. Sem corpo.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: { ultimaComunicacao: '2026-09-30T21:15:04.512Z' } },
  })
  @HttpCode(200)
  @Post()
  registrar(@CurrentIntegracao() integracao: IntegracaoContext) {
    return this.service.registrar(integracao.empresaId, integracao.apiKeyId);
  }
}
