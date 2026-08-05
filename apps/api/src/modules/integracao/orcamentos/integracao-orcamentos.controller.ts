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
  INTEGRACAO_ORCAMENTO_CREATE_EXAMPLE,
  INTEGRACAO_ORCAMENTO_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoOrcamentosService } from './integracao-orcamentos.service';
import {
  IntegracaoOrcamentoCreateDto,
  IntegracaoOrcamentoQueryDto,
  IntegracaoOrcamentoUpdateDto,
} from './dto/integracao-orcamento.dto';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';

@ApiTags('orcamentos')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/orcamentos')
export class IntegracaoOrcamentosController {
  constructor(private readonly service: IntegracaoOrcamentosService) {}

  @ApiOperation({
    summary: 'Listar orçamentos',
    description:
      'Paginado; filtra por ativo e status. Só orçamentos com codigoLegado (criados via API).',
  })
  @ApiPaginationQuery()
  @Get()
  findAll(
    @Query() query: IntegracaoOrcamentoQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findAll(integracao.empresaId, query);
  }

  @ApiOperation({ summary: 'Detalhar orçamento por codigoLegado' })
  @ApiParam({
    name: 'codigo',
    description: 'codigoLegado (id da linha no ERP)',
  })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_ORCAMENTO_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Orçamento não encontrado' })
  @Get(':codigo')
  findOne(
    @Param('codigo', ParseIntPipe) codigo: number,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findOne(integracao.empresaId, codigo);
  }

  @ApiOperation({
    summary: 'Criar orçamento',
    description:
      'clienteCodigo/vendedorCodigo/condicaoPagamentoCodigo e, nos itens, produtoCodigo referenciam ' +
      'os respectivos cadastros pelo codigoErp. O preço unitário informado é o praticado; vlrTabela/' +
      'desconto/total são recalculados a partir da Tabela de Preço do cliente, mesma regra da tela. ' +
      'dataRetorno preenchida gera automaticamente uma Atividade de acompanhamento. Sem vínculo a ' +
      'Oportunidade (recurso interno do CRM, sem chave de legado) — pode ser associado depois ' +
      'manualmente na tela.',
  })
  @ApiBodyExample(INTEGRACAO_ORCAMENTO_CREATE_EXAMPLE)
  @ApiResponse({
    status: 201,
    schema: { example: INTEGRACAO_ORCAMENTO_EXAMPLE },
  })
  @ApiResponse({
    status: 409,
    description: 'Já existe orçamento com esse codigoLegado',
  })
  @Post()
  create(
    @Body() dto: IntegracaoOrcamentoCreateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.create(integracao.empresaId, integracao.apiKeyId, dto);
  }

  @ApiOperation({
    summary: 'Atualizar orçamento',
    description:
      'Atualização parcial. Se "itens" for enviado, substitui o conjunto inteiro de itens. dataRetorno ' +
      'alterada gera automaticamente uma nova Atividade de acompanhamento.',
  })
  @ApiParam({
    name: 'codigo',
    description: 'codigoLegado (id da linha no ERP)',
  })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_ORCAMENTO_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Orçamento não encontrado' })
  @Patch(':codigo')
  update(
    @Param('codigo', ParseIntPipe) codigo: number,
    @Body() dto: IntegracaoOrcamentoUpdateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.update(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
      dto,
    );
  }

  @ApiOperation({ summary: 'Excluir orçamento (soft delete)' })
  @ApiParam({
    name: 'codigo',
    description: 'codigoLegado (id da linha no ERP)',
  })
  @ApiResponse({ status: 200, description: 'Excluído' })
  @ApiResponse({ status: 404, description: 'Orçamento não encontrado' })
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
