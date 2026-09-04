import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
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
  INTEGRACAO_ESTOQUE_CREATE_EXAMPLE,
  INTEGRACAO_ESTOQUE_EXAMPLE,
  INTEGRACAO_LOTE_RESULTADO_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoEstoqueService } from './integracao-estoque.service';
import {
  IntegracaoEstoqueCreateDto,
  IntegracaoEstoqueLoteDto,
  IntegracaoEstoqueQueryDto,
  IntegracaoEstoqueUpdateDto,
} from './dto/integracao-estoque.dto';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';

@ApiTags('estoque')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/estoque')
export class IntegracaoEstoqueController {
  constructor(private readonly service: IntegracaoEstoqueService) {}

  @ApiOperation({
    summary: 'Listar saldos de estoque',
    description: 'Paginado; filtra por produtoCodigo e/ou armazemCodigo.',
  })
  @ApiPaginationQuery()
  @Get()
  findAll(
    @Query() query: IntegracaoEstoqueQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findAll(integracao.empresaId, query);
  }

  @ApiOperation({
    summary: 'Detalhar saldo de estoque por codigoErp',
  })
  @ApiParam({ name: 'codigo', description: 'codigoErp do estoque' })
  @ApiResponse({ status: 200, schema: { example: INTEGRACAO_ESTOQUE_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Saldo de estoque não encontrado' })
  @Get(':codigo')
  findOne(
    @Param('codigo') codigoErp: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findOne(integracao.empresaId, codigoErp);
  }

  @ApiOperation({
    summary: 'Criar ou atualizar saldo de estoque por codigoErp',
    description:
      'POST faz upsert por codigoErp; produtoCodigo e armazemCodigo precisam existir.',
  })
  @ApiBodyExample(INTEGRACAO_ESTOQUE_CREATE_EXAMPLE)
  @ApiResponse({ status: 201, schema: { example: INTEGRACAO_ESTOQUE_EXAMPLE } })
  @Post()
  create(
    @Body() dto: IntegracaoEstoqueCreateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.create(integracao.empresaId, integracao.apiKeyId, dto);
  }

  @ApiOperation({
    summary: 'Enviar lote de estoque',
    description:
      'Upsert em lote por codigoErp (máx. 1.000 por chamada). Um registro com ' +
      '"excluido": true é excluído (soft delete) e dispensa os demais campos. ' +
      'Responde 200 com o relatório: um item inválido não desfaz os que já ' +
      'passaram, e vem listado em "erros" com o índice no array enviado.',
  })
  @ApiBodyExample({ registros: [INTEGRACAO_ESTOQUE_CREATE_EXAMPLE] })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_LOTE_RESULTADO_EXAMPLE },
  })
  @ApiResponse({
    status: 400,
    description: 'Lote vazio ou acima de 1.000 registros',
  })
  @Put()
  upsertLote(
    @Body() dto: IntegracaoEstoqueLoteDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.upsertLote(
      integracao.empresaId,
      integracao.apiKeyId,
      dto.registros,
    );
  }

  @ApiOperation({
    summary: 'Atualizar saldo de estoque',
    description: 'Atualização parcial.',
  })
  @ApiParam({ name: 'codigo', description: 'codigoErp do estoque' })
  @ApiResponse({ status: 200, schema: { example: INTEGRACAO_ESTOQUE_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Saldo de estoque não encontrado' })
  @Patch(':codigo')
  update(
    @Param('codigo') codigoErp: string,
    @Body() dto: IntegracaoEstoqueUpdateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.update(
      integracao.empresaId,
      integracao.apiKeyId,
      codigoErp,
      dto,
    );
  }

  @ApiOperation({ summary: 'Excluir saldo de estoque (soft delete)' })
  @ApiParam({ name: 'codigo', description: 'codigoErp do estoque' })
  @ApiResponse({ status: 200, description: 'Excluído' })
  @ApiResponse({ status: 404, description: 'Saldo de estoque não encontrado' })
  @Delete(':codigo')
  remove(
    @Param('codigo') codigoErp: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.remove(
      integracao.empresaId,
      integracao.apiKeyId,
      codigoErp,
    );
  }
}
