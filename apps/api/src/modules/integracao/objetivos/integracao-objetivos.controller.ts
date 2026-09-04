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
  INTEGRACAO_OBJETIVO_CREATE_EXAMPLE,
  INTEGRACAO_OBJETIVO_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoObjetivosService } from './integracao-objetivos.service';
import {
  IntegracaoObjetivoCreateDto,
  IntegracaoObjetivoLoteDto,
  IntegracaoObjetivoQueryDto,
  IntegracaoObjetivoUpdateDto,
} from './dto/integracao-objetivo.dto';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';

@ApiTags('objetivos')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/objetivos')
export class IntegracaoObjetivosController {
  constructor(private readonly service: IntegracaoObjetivosService) {}

  @ApiOperation({
    summary:
      'Listar objetivos (metas por vendedor/mês, com metas por categoria)',
    description: 'Paginado; filtra por ativo, ano e mês.',
  })
  @ApiPaginationQuery()
  @Get()
  findAll(
    @Query() query: IntegracaoObjetivoQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findAll(integracao.empresaId, query);
  }

  @ApiOperation({ summary: 'Detalhar objetivo por codigoErp' })
  @ApiParam({
    name: 'codigo',
    description: 'codigoErp — a chave de identidade do registro no ERP',
  })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_OBJETIVO_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Objetivo não encontrado' })
  @Get(':codigo')
  findOne(
    @Param('codigo') codigo: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findOne(integracao.empresaId, codigo);
  }

  @ApiOperation({
    summary: 'Criar objetivo',
    description:
      'vendedorCodigo/categoriaCodigo (nas linhas de "categorias") referenciam os respectivos ' +
      'cadastros pelo codigoErp.',
  })
  @ApiBodyExample(INTEGRACAO_OBJETIVO_CREATE_EXAMPLE)
  @ApiResponse({
    status: 201,
    schema: { example: INTEGRACAO_OBJETIVO_EXAMPLE },
  })
  @ApiResponse({
    status: 409,
    description: 'Já existe objetivo com esse codigoErp',
  })
  @Post()
  create(
    @Body() dto: IntegracaoObjetivoCreateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.create(integracao.empresaId, integracao.apiKeyId, dto);
  }

  @ApiOperation({
    summary: 'Enviar lote de objetivos',
    description:
      'Upsert em lote por codigoErp (máx. 1.000 por chamada). Um registro com ' +
      '"excluido": true é excluído (soft delete) e dispensa os demais campos. ' +
      'Responde 200 com o relatório: um item inválido não desfaz os que já ' +
      'passaram, e vem listado em "erros" com o índice no array enviado.',
  })
  @ApiBodyExample({ registros: [INTEGRACAO_OBJETIVO_CREATE_EXAMPLE] })
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
    @Body() dto: IntegracaoObjetivoLoteDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.upsertLote(
      integracao.empresaId,
      integracao.apiKeyId,
      dto.registros,
    );
  }

  @ApiOperation({
    summary: 'Atualizar objetivo',
    description:
      'Atualização parcial. Se "categorias" for enviado, substitui o conjunto inteiro de metas ' +
      'por categoria.',
  })
  @ApiParam({
    name: 'codigo',
    description: 'codigoErp — a chave de identidade do registro no ERP',
  })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_OBJETIVO_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Objetivo não encontrado' })
  @Patch(':codigo')
  update(
    @Param('codigo') codigo: string,
    @Body() dto: IntegracaoObjetivoUpdateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.update(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
      dto,
    );
  }

  @ApiOperation({ summary: 'Excluir objetivo (soft delete)' })
  @ApiParam({
    name: 'codigo',
    description: 'codigoErp — a chave de identidade do registro no ERP',
  })
  @ApiResponse({ status: 200, description: 'Excluído' })
  @ApiResponse({ status: 404, description: 'Objetivo não encontrado' })
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
