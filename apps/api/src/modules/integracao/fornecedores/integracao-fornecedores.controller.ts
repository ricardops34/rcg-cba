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
  INTEGRACAO_FORNECEDOR_CREATE_EXAMPLE,
  INTEGRACAO_FORNECEDOR_EXAMPLE,
  INTEGRACAO_LOTE_RESULTADO_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoFornecedoresService } from './integracao-fornecedores.service';
import {
  IntegracaoFornecedorCreateDto,
  IntegracaoFornecedorLoteDto,
  IntegracaoFornecedorQueryDto,
  IntegracaoFornecedorUpdateDto,
} from './dto/integracao-fornecedor.dto';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';

@ApiTags('fornecedores')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/fornecedores')
export class IntegracaoFornecedoresController {
  constructor(private readonly service: IntegracaoFornecedoresService) {}

  @ApiOperation({
    summary: 'Listar fornecedores',
    description:
      'Paginado; filtra por ativo e busca por razão social ou CNPJ/CPF.',
  })
  @ApiPaginationQuery()
  @Get()
  findAll(
    @Query() query: IntegracaoFornecedorQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findAll(integracao.empresaId, query);
  }

  @ApiOperation({ summary: 'Detalhar fornecedor por codigoErp' })
  @ApiParam({ name: 'codigo', description: 'codigoErp do fornecedor' })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_FORNECEDOR_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Fornecedor não encontrado' })
  @Get(':codigo')
  findOne(
    @Param('codigo') codigo: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findOne(integracao.empresaId, codigo);
  }

  @ApiOperation({
    summary: 'Criar fornecedor',
    description:
      'Upsert por codigoErp. Carregue os fornecedores **antes** das notas de ' +
      'entrada: o fornecedorCodigo da nota aponta para cá e o registro precisa ' +
      'já existir.',
  })
  @ApiBodyExample(INTEGRACAO_FORNECEDOR_CREATE_EXAMPLE)
  @ApiResponse({
    status: 201,
    schema: { example: INTEGRACAO_FORNECEDOR_EXAMPLE },
  })
  @Post()
  create(
    @Body() dto: IntegracaoFornecedorCreateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.create(integracao.empresaId, integracao.apiKeyId, dto);
  }

  @ApiOperation({
    summary: 'Enviar lote de fornecedores',
    description:
      'Upsert em lote por codigoErp (máx. 1.000 por chamada). Um registro com ' +
      '"excluido": true é excluído (soft delete) e dispensa os demais campos. ' +
      'Responde 200 com o relatório: um item inválido não desfaz os que já ' +
      'passaram, e vem listado em "erros" com o índice no array enviado.',
  })
  @ApiBodyExample({ registros: [INTEGRACAO_FORNECEDOR_CREATE_EXAMPLE] })
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
    @Body() dto: IntegracaoFornecedorLoteDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.upsertLote(
      integracao.empresaId,
      integracao.apiKeyId,
      dto.registros,
    );
  }

  @ApiOperation({
    summary: 'Atualizar fornecedor',
    description: 'Atualização parcial.',
  })
  @ApiParam({ name: 'codigo', description: 'codigoErp do fornecedor' })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_FORNECEDOR_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Fornecedor não encontrado' })
  @Patch(':codigo')
  update(
    @Param('codigo') codigo: string,
    @Body() dto: IntegracaoFornecedorUpdateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.update(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
      dto,
    );
  }

  @ApiOperation({ summary: 'Excluir fornecedor (soft delete)' })
  @ApiParam({ name: 'codigo', description: 'codigoErp do fornecedor' })
  @ApiResponse({ status: 200, description: 'Excluído' })
  @ApiResponse({ status: 404, description: 'Fornecedor não encontrado' })
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
