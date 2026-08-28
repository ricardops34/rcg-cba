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
  INTEGRACAO_ORCAMENTO_CREATE_EXAMPLE,
  INTEGRACAO_ORCAMENTO_EXAMPLE,
  INTEGRACAO_ORCAMENTO_VINCULAR_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoOrcamentosService } from './integracao-orcamentos.service';
import {
  IntegracaoOrcamentoCreateDto,
  IntegracaoOrcamentoQueryDto,
  IntegracaoOrcamentoUpdateDto,
  IntegracaoOrcamentoVincularDto,
} from './dto/integracao-orcamento.dto';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

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
      'Paginado; filtra por ativo e status. Só orçamentos com codigoErp (ou seja, já ' +
      'vinculados ao ERP — criados por aqui via POST, ou criados na plataforma e vinculados via ' +
      'PATCH .../pendentes/{id}). Orçamentos aprovados aguardando vínculo estão em GET .../pendentes.',
  })
  @ApiPaginationQuery()
  @Get()
  findAll(
    @Query() query: IntegracaoOrcamentoQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findAll(integracao.empresaId, query);
  }

  // Declarado antes de GET :codigo, senão o Nest casa "pendentes" como :codigo.
  @ApiOperation({
    summary: 'Listar orçamentos aprovados pendentes de integração',
    description:
      'Orçamentos aprovados criados na plataforma (sem codigoErp ainda) — prontos pro ERP ' +
      'importar. Depois de importar, chame PATCH .../pendentes/{id} com o codigoErp gerado no ' +
      'ERP pra vincular; a partir daí o orçamento passa a aparecer no GET normal, como qualquer outro.',
  })
  @ApiPaginationQuery()
  @Get('pendentes')
  findAllPendentes(
    @Query() query: PaginationQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findAllPendentes(integracao.empresaId, query);
  }

  // Idem: declarado antes de PATCH :codigo.
  @ApiOperation({
    summary: 'Vincular orçamento aprovado ao codigoErp do ERP',
    description:
      'Marca o orçamento como integrado, gravando o codigoErp gerado ao importar no ERP. Só ' +
      'funciona uma vez — orçamento já vinculado, ainda não aprovado, ou codigoErp colidindo ' +
      'com outro orçamento retornam 409.',
  })
  @ApiParam({
    name: 'id',
    description: 'id interno da plataforma (retornado no GET .../pendentes)',
  })
  @ApiBodyExample(INTEGRACAO_ORCAMENTO_VINCULAR_EXAMPLE)
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_ORCAMENTO_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Orçamento não encontrado' })
  @ApiResponse({
    status: 409,
    description: 'Já vinculado, ainda não aprovado, ou codigoErp duplicado',
  })
  @Patch('pendentes/:id')
  vincular(
    @Param('id') id: string,
    @Body() dto: IntegracaoOrcamentoVincularDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.vincular(
      integracao.empresaId,
      integracao.apiKeyId,
      id,
      dto.codigoErp,
    );
  }

  @ApiOperation({ summary: 'Detalhar orçamento por codigoErp' })
  @ApiParam({
    name: 'codigo',
    description: 'codigoErp — a chave de identidade do registro no ERP',
  })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_ORCAMENTO_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Orçamento não encontrado' })
  @Get(':codigo')
  findOne(
    @Param('codigo') codigo: string,
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
    description: 'Já existe orçamento com esse codigoErp',
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
      'alterada gera automaticamente uma nova Atividade de acompanhamento. Orçamento com status ' +
      '"aprovado" não pode mais ser alterado (409).',
  })
  @ApiParam({
    name: 'codigo',
    description: 'codigoErp — a chave de identidade do registro no ERP',
  })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_ORCAMENTO_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Orçamento não encontrado' })
  @ApiResponse({
    status: 409,
    description: 'Orçamento aprovado não pode ser alterado',
  })
  @Patch(':codigo')
  update(
    @Param('codigo') codigo: string,
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
    description: 'codigoErp — a chave de identidade do registro no ERP',
  })
  @ApiResponse({ status: 200, description: 'Excluído' })
  @ApiResponse({ status: 404, description: 'Orçamento não encontrado' })
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
