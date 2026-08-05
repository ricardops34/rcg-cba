import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  INTEGRACAO_ARMAZEM_CREATE_EXAMPLE,
  INTEGRACAO_ARMAZEM_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoArmazensService } from './integracao-armazens.service';
import {
  IntegracaoArmazemCreateDto,
  IntegracaoArmazemQueryDto,
  IntegracaoArmazemUpdateDto,
} from './dto/integracao-armazem.dto';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';

@ApiTags('armazens')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/armazens')
export class IntegracaoArmazensController {
  constructor(private readonly service: IntegracaoArmazensService) {}

  @ApiOperation({
    summary: 'Listar armazéns',
    description: 'Paginado; filtra por ativo e busca por descrição.',
  })
  @ApiPaginationQuery()
  @Get()
  findAll(
    @Query() query: IntegracaoArmazemQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findAll(integracao.empresaId, query);
  }

  @ApiOperation({ summary: 'Detalhar armazém por codigoErp' })
  @ApiParam({ name: 'codigo', description: 'codigoErp do armazém' })
  @ApiResponse({ status: 200, schema: { example: INTEGRACAO_ARMAZEM_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Armazém não encontrado' })
  @Get(':codigo')
  findOne(
    @Param('codigo') codigo: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findOne(integracao.empresaId, codigo);
  }

  @ApiOperation({ summary: 'Criar armazém' })
  @ApiBodyExample(INTEGRACAO_ARMAZEM_CREATE_EXAMPLE)
  @ApiResponse({ status: 201, schema: { example: INTEGRACAO_ARMAZEM_EXAMPLE } })
  @ApiResponse({
    status: 409,
    description: 'Já existe armazém com esse codigoErp',
  })
  @Post()
  create(
    @Body() dto: IntegracaoArmazemCreateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.create(integracao.empresaId, integracao.apiKeyId, dto);
  }

  @ApiOperation({
    summary: 'Atualizar armazém',
    description: 'Atualização parcial.',
  })
  @ApiParam({ name: 'codigo', description: 'codigoErp do armazém' })
  @ApiResponse({ status: 200, schema: { example: INTEGRACAO_ARMAZEM_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Armazém não encontrado' })
  @Patch(':codigo')
  update(
    @Param('codigo') codigo: string,
    @Body() dto: IntegracaoArmazemUpdateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.update(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
      dto,
    );
  }

  @ApiOperation({ summary: 'Excluir armazém (soft delete)' })
  @ApiParam({ name: 'codigo', description: 'codigoErp do armazém' })
  @ApiResponse({ status: 200, description: 'Excluído' })
  @ApiResponse({ status: 404, description: 'Armazém não encontrado' })
  @Delete(':codigo')
  remove(
    @Param('codigo') codigo: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.remove(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
    );
  }
}
