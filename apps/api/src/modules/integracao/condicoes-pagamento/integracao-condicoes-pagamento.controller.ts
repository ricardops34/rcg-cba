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
  INTEGRACAO_CONDICAO_PAGAMENTO_CREATE_EXAMPLE,
  INTEGRACAO_CONDICAO_PAGAMENTO_EXAMPLE,
  INTEGRACAO_LOTE_RESULTADO_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoCondicoesPagamentoService } from './integracao-condicoes-pagamento.service';
import {
  IntegracaoCondicaoPagamentoCreateDto,
  IntegracaoCondicaoPagamentoLoteDto,
  IntegracaoCondicaoPagamentoQueryDto,
  IntegracaoCondicaoPagamentoUpdateDto,
} from './dto/integracao-condicao-pagamento.dto';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';

@ApiTags('condicoes-pagamento')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/condicoes-pagamento')
export class IntegracaoCondicoesPagamentoController {
  constructor(private readonly service: IntegracaoCondicoesPagamentoService) {}

  @ApiOperation({
    summary: 'Listar condições de pagamento',
    description: 'Paginado; filtra por ativo e busca por descrição.',
  })
  @ApiPaginationQuery()
  @Get()
  findAll(
    @Query() query: IntegracaoCondicaoPagamentoQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findAll(integracao.empresaId, query);
  }

  @ApiOperation({ summary: 'Detalhar condição de pagamento por codigoErp' })
  @ApiParam({ name: 'codigo', description: 'codigoErp da condição' })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_CONDICAO_PAGAMENTO_EXAMPLE },
  })
  @ApiResponse({
    status: 404,
    description: 'Condição de pagamento não encontrada',
  })
  @Get(':codigo')
  findOne(
    @Param('codigo') codigo: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findOne(integracao.empresaId, codigo);
  }

  @ApiOperation({ summary: 'Criar condição de pagamento' })
  @ApiBodyExample(INTEGRACAO_CONDICAO_PAGAMENTO_CREATE_EXAMPLE)
  @ApiResponse({
    status: 201,
    schema: { example: INTEGRACAO_CONDICAO_PAGAMENTO_EXAMPLE },
  })
  @ApiResponse({
    status: 409,
    description: 'Já existe condição de pagamento com esse codigoErp',
  })
  @Post()
  create(
    @Body() dto: IntegracaoCondicaoPagamentoCreateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.create(integracao.empresaId, integracao.apiKeyId, dto);
  }

  @ApiOperation({
    summary: 'Enviar lote de condicoes-pagamento',
    description:
      'Upsert em lote por codigoErp (máx. 1.000 por chamada). Um registro com ' +
      '"excluido": true é excluído (soft delete) e dispensa os demais campos. ' +
      'Responde 200 com o relatório: um item inválido não desfaz os que já ' +
      'passaram, e vem listado em "erros" com o índice no array enviado.',
  })
  @ApiBodyExample({ registros: [INTEGRACAO_CONDICAO_PAGAMENTO_CREATE_EXAMPLE] })
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
    @Body() dto: IntegracaoCondicaoPagamentoLoteDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.upsertLote(
      integracao.empresaId,
      integracao.apiKeyId,
      dto.registros,
    );
  }

  @ApiOperation({
    summary: 'Atualizar condição de pagamento',
    description: 'Atualização parcial.',
  })
  @ApiParam({ name: 'codigo', description: 'codigoErp da condição' })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_CONDICAO_PAGAMENTO_EXAMPLE },
  })
  @ApiResponse({
    status: 404,
    description: 'Condição de pagamento não encontrada',
  })
  @Patch(':codigo')
  update(
    @Param('codigo') codigo: string,
    @Body() dto: IntegracaoCondicaoPagamentoUpdateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.update(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
      dto,
    );
  }

  @ApiOperation({ summary: 'Excluir condição de pagamento (soft delete)' })
  @ApiParam({ name: 'codigo', description: 'codigoErp da condição' })
  @ApiResponse({ status: 200, description: 'Excluída' })
  @ApiResponse({
    status: 404,
    description: 'Condição de pagamento não encontrada',
  })
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
