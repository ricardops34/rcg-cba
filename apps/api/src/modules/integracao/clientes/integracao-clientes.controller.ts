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
  INTEGRACAO_CLIENTE_CREATE_EXAMPLE,
  INTEGRACAO_CLIENTE_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoClientesService } from './integracao-clientes.service';
import {
  IntegracaoClienteCreateDto,
  IntegracaoClienteQueryDto,
  IntegracaoClienteUpdateDto,
} from './dto/integracao-cliente.dto';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';

@ApiTags('clientes')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/clientes')
export class IntegracaoClientesController {
  constructor(private readonly service: IntegracaoClientesService) {}

  @ApiOperation({
    summary: 'Listar clientes',
    description: 'Paginado; filtra por ativo e busca por razão social.',
  })
  @ApiPaginationQuery()
  @Get()
  findAll(
    @Query() query: IntegracaoClienteQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findAll(integracao.empresaId, query);
  }

  @ApiOperation({ summary: 'Detalhar cliente por codigoErp' })
  @ApiParam({ name: 'codigo', description: 'codigoErp do cliente' })
  @ApiResponse({ status: 200, schema: { example: INTEGRACAO_CLIENTE_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  @Get(':codigo')
  findOne(
    @Param('codigo') codigo: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findOne(integracao.empresaId, codigo);
  }

  @ApiOperation({
    summary: 'Criar cliente',
    description:
      'vendedorCodigo/tabelaPrecoCodigo referenciam os respectivos cadastros pelo codigoErp ' +
      '(precisam já existir). Coleções filhas (CNAEs/contatos/sócios) não fazem parte desta versão.',
  })
  @ApiBodyExample(INTEGRACAO_CLIENTE_CREATE_EXAMPLE)
  @ApiResponse({ status: 201, schema: { example: INTEGRACAO_CLIENTE_EXAMPLE } })
  @ApiResponse({
    status: 409,
    description: 'Já existe cliente com esse codigoErp',
  })
  @Post()
  create(
    @Body() dto: IntegracaoClienteCreateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.create(integracao.empresaId, integracao.apiKeyId, dto);
  }

  @ApiOperation({
    summary: 'Atualizar cliente',
    description: 'Atualização parcial.',
  })
  @ApiParam({ name: 'codigo', description: 'codigoErp do cliente' })
  @ApiResponse({ status: 200, schema: { example: INTEGRACAO_CLIENTE_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  @Patch(':codigo')
  update(
    @Param('codigo') codigo: string,
    @Body() dto: IntegracaoClienteUpdateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.update(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
      dto,
    );
  }

  @ApiOperation({ summary: 'Excluir cliente (soft delete)' })
  @ApiParam({ name: 'codigo', description: 'codigoErp do cliente' })
  @ApiResponse({ status: 200, description: 'Excluído' })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
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
