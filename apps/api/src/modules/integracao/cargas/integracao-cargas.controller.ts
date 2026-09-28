import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { INTEGRACAO_CARGA_EXAMPLE } from '@plataforma/contracts';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';
import { IntegracaoCargasService } from './integracao-cargas.service';
import { IntegracaoCargaErrosQueryDto } from './dto/integracao-carga.dto';

@ApiTags('cargas')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/cargas')
export class IntegracaoCargasController {
  constructor(private readonly service: IntegracaoCargasService) {}

  @ApiOperation({
    summary: 'Enviar carga por arquivo',
    description:
      'Corpo = o arquivo, em JSON Lines: uma linha por registro, ' +
      '{"entidade":"<rota>","registro":{...mesmo item do PUT...}}. ' +
      'Content-Type application/gzip (compactado) ou application/x-ndjson ' +
      '(texto). Até 100 MB recebidos. Responde 202 e processa em segundo ' +
      'plano, uma carga por vez por empresa, na ordem de chegada.',
  })
  @ApiConsumes('application/gzip', 'application/x-ndjson')
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiQuery({ name: 'descricao', required: false })
  @ApiResponse({ status: 202, schema: { example: INTEGRACAO_CARGA_EXAMPLE } })
  @ApiResponse({
    status: 400,
    description:
      'Arquivo recusado inteiro: gzip corrompido, linha que não é JSON, entidade não aceita',
  })
  @ApiResponse({ status: 413, description: 'Acima de 100 MB' })
  @Post()
  @HttpCode(202)
  receber(
    @Req() req: Request,
    @Query('descricao') descricao: string | undefined,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.receber(
      integracao.empresaId,
      integracao.apiKeyId,
      req.body,
      descricao,
    );
  }

  @ApiOperation({ summary: 'Listar as últimas cargas por arquivo' })
  @Get()
  listar(@CurrentIntegracao() integracao: IntegracaoContext) {
    return this.service.listar(integracao.empresaId);
  }

  @ApiOperation({ summary: 'Situação e progresso de uma carga' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, schema: { example: INTEGRACAO_CARGA_EXAMPLE } })
  @Get(':id')
  obter(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.obter(integracao.empresaId, id);
  }

  @ApiOperation({
    summary: 'Registros recusados de uma carga',
    description:
      'Linha do arquivo, entidade, chave e motivo, na ordem das linhas.',
  })
  @ApiParam({ name: 'id' })
  @Get(':id/erros')
  erros(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: IntegracaoCargaErrosQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.erros(integracao.empresaId, id, query);
  }

  @ApiOperation({
    summary: 'Cancelar uma carga',
    description:
      'Não começada: cancela na hora. Em andamento: para no fim do bloco ' +
      'atual — o que já foi aplicado fica aplicado.',
  })
  @ApiParam({ name: 'id' })
  @Post(':id/cancelar')
  @HttpCode(200)
  cancelar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.cancelar(integracao.empresaId, id);
  }
}
