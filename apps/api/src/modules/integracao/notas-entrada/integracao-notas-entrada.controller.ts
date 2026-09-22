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
  INTEGRACAO_NOTA_ENTRADA_CREATE_EXAMPLE,
  INTEGRACAO_NOTA_ENTRADA_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoNotasEntradaService } from './integracao-notas-entrada.service';
import {
  IntegracaoNotaEntradaCreateDto,
  IntegracaoNotaEntradaLoteDto,
  IntegracaoNotaEntradaQueryDto,
  IntegracaoNotaEntradaUpdateDto,
} from './dto/integracao-nota-entrada.dto';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';

@ApiTags('notas-entrada')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/notas-entrada')
export class IntegracaoNotasEntradaController {
  constructor(private readonly service: IntegracaoNotasEntradaService) {}

  @ApiOperation({
    summary: 'Listar notas de entrada',
    description:
      'Paginado; filtra por ativo e fornecedorChave, e busca por número.',
  })
  @ApiPaginationQuery()
  @Get()
  findAll(
    @Query() query: IntegracaoNotaEntradaQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findAll(integracao.empresaId, query);
  }

  @ApiOperation({ summary: 'Detalhar nota de entrada por chave' })
  @ApiParam({
    name: 'codigo',
    description: 'chave — a chave de identidade do registro no ERP',
  })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_NOTA_ENTRADA_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Nota de entrada não encontrada' })
  @Get(':codigo')
  findOne(
    @Param('codigo') codigo: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findOne(integracao.empresaId, codigo);
  }

  @ApiOperation({
    summary: 'Criar nota de entrada',
    description:
      'Upsert por chave. fornecedorChave/condicaoChave e, nos itens, ' +
      'produtoChave e armazemChave referenciam os respectivos cadastros pelo ' +
      'chave — carregue os fornecedores antes das notas.',
  })
  @ApiBodyExample(INTEGRACAO_NOTA_ENTRADA_CREATE_EXAMPLE)
  @ApiResponse({
    status: 201,
    schema: { example: INTEGRACAO_NOTA_ENTRADA_EXAMPLE },
  })
  @Post()
  create(
    @Body() dto: IntegracaoNotaEntradaCreateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.create(integracao.empresaId, integracao.apiKeyId, dto);
  }

  @ApiOperation({
    summary: 'Enviar lote de notas-entrada',
    description:
      'Upsert em lote por chave (máx. 1.000 por chamada). Um registro com ' +
      '"excluido": true é excluído (soft delete) e dispensa os demais campos. ' +
      'Responde 200 com o relatório: um item inválido não desfaz os que já ' +
      'passaram, e vem listado em "erros" com o índice no array enviado.',
  })
  @ApiBodyExample({ registros: [INTEGRACAO_NOTA_ENTRADA_CREATE_EXAMPLE] })
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
    @Body() dto: IntegracaoNotaEntradaLoteDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.upsertLote(
      integracao.empresaId,
      integracao.apiKeyId,
      dto.registros,
    );
  }

  @ApiOperation({
    summary: 'Atualizar nota de entrada',
    description:
      'Atualização parcial. Itens com delete=true são excluídos; os demais são incluídos ou atualizados.',
  })
  @ApiParam({
    name: 'codigo',
    description: 'chave — a chave de identidade do registro no ERP',
  })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_NOTA_ENTRADA_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Nota de entrada não encontrada' })
  @Patch(':codigo')
  update(
    @Param('codigo') codigo: string,
    @Body() dto: IntegracaoNotaEntradaUpdateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.update(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
      dto,
    );
  }

  @ApiOperation({ summary: 'Excluir nota de entrada (soft delete)' })
  @ApiParam({
    name: 'codigo',
    description: 'chave — a chave de identidade do registro no ERP',
  })
  @ApiResponse({ status: 200, description: 'Excluída' })
  @ApiResponse({ status: 404, description: 'Nota de entrada não encontrada' })
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
