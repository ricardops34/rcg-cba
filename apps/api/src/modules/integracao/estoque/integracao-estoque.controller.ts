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
  INTEGRACAO_ESTOQUE_CREATE_EXAMPLE,
  INTEGRACAO_ESTOQUE_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoEstoqueService } from './integracao-estoque.service';
import {
  IntegracaoEstoqueCreateDto,
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
    summary: 'Detalhar saldo de estoque por produtoCodigo + armazemCodigo',
  })
  @ApiParam({ name: 'produtoCodigo', description: 'codigoErp do produto' })
  @ApiParam({ name: 'armazemCodigo', description: 'codigoErp do armazém' })
  @ApiResponse({ status: 200, schema: { example: INTEGRACAO_ESTOQUE_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Saldo de estoque não encontrado' })
  @Get(':produtoCodigo/:armazemCodigo')
  findOne(
    @Param('produtoCodigo') produtoCodigo: string,
    @Param('armazemCodigo') armazemCodigo: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findOne(
      integracao.empresaId,
      produtoCodigo,
      armazemCodigo,
    );
  }

  @ApiOperation({
    summary: 'Criar saldo de estoque',
    description:
      'Chave é a combinação produtoCodigo + armazemCodigo (ambos precisam já existir) — sem ' +
      'código próprio.',
  })
  @ApiBodyExample(INTEGRACAO_ESTOQUE_CREATE_EXAMPLE)
  @ApiResponse({ status: 201, schema: { example: INTEGRACAO_ESTOQUE_EXAMPLE } })
  @ApiResponse({
    status: 409,
    description: 'Já existe saldo para essa combinação produto + armazém',
  })
  @Post()
  create(
    @Body() dto: IntegracaoEstoqueCreateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.create(integracao.empresaId, integracao.apiKeyId, dto);
  }

  @ApiOperation({
    summary: 'Atualizar saldo de estoque',
    description: 'Atualização parcial.',
  })
  @ApiParam({ name: 'produtoCodigo', description: 'codigoErp do produto' })
  @ApiParam({ name: 'armazemCodigo', description: 'codigoErp do armazém' })
  @ApiResponse({ status: 200, schema: { example: INTEGRACAO_ESTOQUE_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Saldo de estoque não encontrado' })
  @Patch(':produtoCodigo/:armazemCodigo')
  update(
    @Param('produtoCodigo') produtoCodigo: string,
    @Param('armazemCodigo') armazemCodigo: string,
    @Body() dto: IntegracaoEstoqueUpdateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.update(
      integracao.empresaId,
      integracao.apiKeyId,
      produtoCodigo,
      armazemCodigo,
      dto,
    );
  }

  @ApiOperation({ summary: 'Excluir saldo de estoque (soft delete)' })
  @ApiParam({ name: 'produtoCodigo', description: 'codigoErp do produto' })
  @ApiParam({ name: 'armazemCodigo', description: 'codigoErp do armazém' })
  @ApiResponse({ status: 200, description: 'Excluído' })
  @ApiResponse({ status: 404, description: 'Saldo de estoque não encontrado' })
  @Delete(':produtoCodigo/:armazemCodigo')
  remove(
    @Param('produtoCodigo') produtoCodigo: string,
    @Param('armazemCodigo') armazemCodigo: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.remove(
      integracao.empresaId,
      integracao.apiKeyId,
      produtoCodigo,
      armazemCodigo,
    );
  }
}
