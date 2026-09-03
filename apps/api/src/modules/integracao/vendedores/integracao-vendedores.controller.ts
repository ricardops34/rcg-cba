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
  INTEGRACAO_VENDEDOR_CREATE_EXAMPLE,
  INTEGRACAO_VENDEDOR_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoVendedoresService } from './integracao-vendedores.service';
import {
  IntegracaoVendedorCreateDto,
  IntegracaoVendedorQueryDto,
  IntegracaoVendedorUpdateDto,
} from './dto/integracao-vendedor.dto';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';

@ApiTags('vendedores')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/vendedores')
export class IntegracaoVendedoresController {
  constructor(private readonly service: IntegracaoVendedoresService) {}

  @ApiOperation({
    summary: 'Listar vendedores',
    description: 'Paginado; filtra por ativo e busca por nome.',
  })
  @ApiPaginationQuery()
  @Get()
  findAll(
    @Query() query: IntegracaoVendedorQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findAll(integracao.empresaId, query);
  }

  @ApiOperation({ summary: 'Detalhar vendedor por codigoErp' })
  @ApiParam({ name: 'codigo', description: 'codigoErp do vendedor' })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_VENDEDOR_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Vendedor não encontrado' })
  @Get(':codigo')
  findOne(
    @Param('codigo') codigo: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findOne(integracao.empresaId, codigo);
  }

  @ApiOperation({
    summary: 'Criar vendedor',
    description:
      'supervisorCodigo referencia outro vendedor pelo codigoErp (precisa já existir). gerente/' +
      'usuarioId nunca é alterado por esta API — vínculo mantido manualmente na tela.',
  })
  @ApiBodyExample(INTEGRACAO_VENDEDOR_CREATE_EXAMPLE)
  @ApiResponse({
    status: 201,
    schema: { example: INTEGRACAO_VENDEDOR_EXAMPLE },
  })
  @ApiResponse({
    status: 409,
    description: 'Já existe vendedor com esse codigoErp',
  })
  @Post()
  create(
    @Body() dto: IntegracaoVendedorCreateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.create(integracao.empresaId, integracao.apiKeyId, dto);
  }

  @ApiOperation({
    summary: 'Atualizar vendedor',
    description: 'Atualização parcial.',
  })
  @ApiParam({ name: 'codigo', description: 'codigoErp do vendedor' })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_VENDEDOR_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Vendedor não encontrado' })
  @Patch(':codigo')
  update(
    @Param('codigo') codigo: string,
    @Body() dto: IntegracaoVendedorUpdateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.update(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
      dto,
    );
  }

  @ApiOperation({ summary: 'Excluir vendedor (soft delete)' })
  @ApiParam({ name: 'codigo', description: 'codigoErp do vendedor' })
  @ApiResponse({ status: 200, description: 'Excluído' })
  @ApiResponse({ status: 404, description: 'Vendedor não encontrado' })
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
