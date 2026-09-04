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
  INTEGRACAO_PRODUTO_CREATE_EXAMPLE,
  INTEGRACAO_PRODUTO_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoProdutosService } from './integracao-produtos.service';
import {
  IntegracaoProdutoCreateDto,
  IntegracaoProdutoLoteDto,
  IntegracaoProdutoQueryDto,
  IntegracaoProdutoUpdateDto,
} from './dto/integracao-produto.dto';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';

@ApiTags('produtos')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/produtos')
export class IntegracaoProdutosController {
  constructor(private readonly service: IntegracaoProdutosService) {}

  @ApiOperation({
    summary: 'Listar produtos',
    description: 'Paginado; filtra por ativo e busca por descrição.',
  })
  @ApiPaginationQuery()
  @Get()
  findAll(
    @Query() query: IntegracaoProdutoQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findAll(integracao.empresaId, query);
  }

  @ApiOperation({ summary: 'Detalhar produto por codigoErp' })
  @ApiParam({ name: 'codigo', description: 'codigoErp do produto' })
  @ApiResponse({ status: 200, schema: { example: INTEGRACAO_PRODUTO_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Produto não encontrado' })
  @Get(':codigo')
  findOne(
    @Param('codigo') codigo: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findOne(integracao.empresaId, codigo);
  }

  @ApiOperation({
    summary: 'Criar produto',
    description:
      'categoriaCodigo/subCategoriaCodigo/armazemCodigo referenciam os respectivos cadastros ' +
      'pelo codigoErp (precisam já existir).',
  })
  @ApiBodyExample(INTEGRACAO_PRODUTO_CREATE_EXAMPLE)
  @ApiResponse({ status: 201, schema: { example: INTEGRACAO_PRODUTO_EXAMPLE } })
  @ApiResponse({
    status: 409,
    description: 'Já existe produto com esse codigoErp',
  })
  @Post()
  create(
    @Body() dto: IntegracaoProdutoCreateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.create(integracao.empresaId, integracao.apiKeyId, dto);
  }

  @ApiOperation({
    summary: 'Enviar lote de produtos',
    description:
      'Upsert em lote por codigoErp (máx. 1.000 por chamada). Um registro com ' +
      '"excluido": true é excluído (soft delete) e dispensa os demais campos. ' +
      'Responde 200 com o relatório: um item inválido não desfaz os que já ' +
      'passaram, e vem listado em "erros" com o índice no array enviado.',
  })
  @ApiBodyExample({ registros: [INTEGRACAO_PRODUTO_CREATE_EXAMPLE] })
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
    @Body() dto: IntegracaoProdutoLoteDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.upsertLote(
      integracao.empresaId,
      integracao.apiKeyId,
      dto.registros,
    );
  }

  @ApiOperation({
    summary: 'Atualizar produto',
    description: 'Atualização parcial.',
  })
  @ApiParam({ name: 'codigo', description: 'codigoErp do produto' })
  @ApiResponse({ status: 200, schema: { example: INTEGRACAO_PRODUTO_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Produto não encontrado' })
  @Patch(':codigo')
  update(
    @Param('codigo') codigo: string,
    @Body() dto: IntegracaoProdutoUpdateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.update(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
      dto,
    );
  }

  @ApiOperation({ summary: 'Excluir produto (soft delete)' })
  @ApiParam({ name: 'codigo', description: 'codigoErp do produto' })
  @ApiResponse({ status: 200, description: 'Excluído' })
  @ApiResponse({ status: 404, description: 'Produto não encontrado' })
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
