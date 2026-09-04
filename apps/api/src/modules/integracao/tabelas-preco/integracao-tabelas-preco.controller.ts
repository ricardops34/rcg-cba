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
  INTEGRACAO_LOTE_RESULTADO_EXAMPLE,
  INTEGRACAO_TABELA_PRECO_CREATE_EXAMPLE,
  INTEGRACAO_TABELA_PRECO_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoTabelasPrecoService } from './integracao-tabelas-preco.service';
import {
  IntegracaoTabelaPrecoCreateDto,
  IntegracaoTabelaPrecoLoteDto,
  IntegracaoTabelaPrecoQueryDto,
  IntegracaoTabelaPrecoUpdateDto,
} from './dto/integracao-tabela-preco.dto';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';

@ApiTags('tabelas-preco')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/tabelas-preco')
export class IntegracaoTabelasPrecoController {
  constructor(private readonly service: IntegracaoTabelasPrecoService) {}

  @ApiOperation({
    summary: 'Listar tabelas de preço',
    description: 'Paginado; filtra por ativo e busca por descrição.',
  })
  @ApiPaginationQuery()
  @Get()
  findAll(
    @Query() query: IntegracaoTabelaPrecoQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findAll(integracao.empresaId, query);
  }

  @ApiOperation({
    summary: 'Detalhar tabela de preço (com itens) por codigoErp',
  })
  @ApiParam({ name: 'codigo', description: 'codigoErp da tabela' })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_TABELA_PRECO_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Tabela de preço não encontrada' })
  @Get(':codigo')
  findOne(
    @Param('codigo') codigo: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findOne(integracao.empresaId, codigo);
  }

  @ApiOperation({
    summary: 'Criar tabela de preço (com itens)',
    description:
      'produtoCodigo (em cada item) referencia um produto pelo codigoErp (precisa já existir).',
  })
  @ApiBodyExample(INTEGRACAO_TABELA_PRECO_CREATE_EXAMPLE)
  @ApiResponse({
    status: 201,
    schema: { example: INTEGRACAO_TABELA_PRECO_EXAMPLE },
  })
  @ApiResponse({
    status: 409,
    description: 'Já existe tabela de preço com esse codigoErp',
  })
  @Post()
  create(
    @Body() dto: IntegracaoTabelaPrecoCreateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.create(integracao.empresaId, integracao.apiKeyId, dto);
  }

  @ApiOperation({
    summary: 'Enviar lote de tabelas-preco',
    description:
      'Upsert em lote por codigoErp (máx. 1.000 por chamada). Um registro com ' +
      '"excluido": true é excluído (soft delete) e dispensa os demais campos. ' +
      'Responde 200 com o relatório: um item inválido não desfaz os que já ' +
      'passaram, e vem listado em "erros" com o índice no array enviado.',
  })
  @ApiBodyExample({ registros: [INTEGRACAO_TABELA_PRECO_CREATE_EXAMPLE] })
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
    @Body() dto: IntegracaoTabelaPrecoLoteDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.upsertLote(
      integracao.empresaId,
      integracao.apiKeyId,
      dto.registros,
    );
  }

  @ApiOperation({
    summary: 'Atualizar tabela de preço',
    description:
      'Atualização parcial. Itens com delete=true são excluídos; os demais são incluídos ou atualizados.',
  })
  @ApiParam({ name: 'codigo', description: 'codigoErp da tabela' })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_TABELA_PRECO_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Tabela de preço não encontrada' })
  @Patch(':codigo')
  update(
    @Param('codigo') codigo: string,
    @Body() dto: IntegracaoTabelaPrecoUpdateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.update(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
      dto,
    );
  }

  @ApiOperation({ summary: 'Excluir tabela de preço (soft delete)' })
  @ApiParam({ name: 'codigo', description: 'codigoErp da tabela' })
  @ApiResponse({ status: 200, description: 'Excluída' })
  @ApiResponse({ status: 404, description: 'Tabela de preço não encontrada' })
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
