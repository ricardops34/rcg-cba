import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
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
  INTEGRACAO_TITULO_RECEBER_CREATE_EXAMPLE,
  INTEGRACAO_TITULO_RECEBER_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoTitulosReceberService } from './integracao-titulos-receber.service';
import {
  IntegracaoTituloReceberCreateDto,
  IntegracaoTituloReceberQueryDto,
  IntegracaoTituloReceberUpdateDto,
} from './dto/integracao-titulo-receber.dto';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';

@ApiTags('titulos-receber')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/titulos-receber')
export class IntegracaoTitulosReceberController {
  constructor(private readonly service: IntegracaoTitulosReceberService) {}

  @ApiOperation({
    summary: 'Listar títulos a receber',
    description: 'Paginado; filtra por ativo e busca por número.',
  })
  @ApiPaginationQuery()
  @Get()
  findAll(
    @Query() query: IntegracaoTituloReceberQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findAll(integracao.empresaId, query);
  }

  @ApiOperation({ summary: 'Detalhar título a receber por codigoLegado' })
  @ApiParam({
    name: 'codigo',
    description: 'codigoLegado (id da linha no ERP)',
  })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_TITULO_RECEBER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Título a receber não encontrado' })
  @Get(':codigo')
  findOne(
    @Param('codigo', ParseIntPipe) codigo: number,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findOne(integracao.empresaId, codigo);
  }

  @ApiOperation({
    summary: 'Criar título a receber',
    description:
      'clienteCodigo/vendedorCodigo referenciam os respectivos cadastros pelo codigoErp.',
  })
  @ApiBodyExample(INTEGRACAO_TITULO_RECEBER_CREATE_EXAMPLE)
  @ApiResponse({
    status: 201,
    schema: { example: INTEGRACAO_TITULO_RECEBER_EXAMPLE },
  })
  @ApiResponse({
    status: 409,
    description: 'Já existe título com esse codigoLegado',
  })
  @Post()
  create(
    @Body() dto: IntegracaoTituloReceberCreateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.create(integracao.empresaId, integracao.apiKeyId, dto);
  }

  @ApiOperation({
    summary: 'Atualizar título a receber',
    description: 'Atualização parcial.',
  })
  @ApiParam({
    name: 'codigo',
    description: 'codigoLegado (id da linha no ERP)',
  })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_TITULO_RECEBER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Título a receber não encontrado' })
  @Patch(':codigo')
  update(
    @Param('codigo', ParseIntPipe) codigo: number,
    @Body() dto: IntegracaoTituloReceberUpdateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.update(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
      dto,
    );
  }

  @ApiOperation({ summary: 'Excluir título a receber (soft delete)' })
  @ApiParam({
    name: 'codigo',
    description: 'codigoLegado (id da linha no ERP)',
  })
  @ApiResponse({ status: 200, description: 'Excluído' })
  @ApiResponse({ status: 404, description: 'Título a receber não encontrado' })
  @Delete(':codigo')
  remove(
    @Param('codigo', ParseIntPipe) codigo: number,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.remove(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
    );
  }
}
