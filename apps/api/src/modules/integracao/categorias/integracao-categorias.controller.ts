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
  INTEGRACAO_CATEGORIA_CREATE_EXAMPLE,
  INTEGRACAO_CATEGORIA_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoCategoriasService } from './integracao-categorias.service';
import {
  IntegracaoCategoriaCreateDto,
  IntegracaoCategoriaQueryDto,
  IntegracaoCategoriaUpdateDto,
} from './dto/integracao-categoria.dto';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';

@ApiTags('categorias')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/categorias')
export class IntegracaoCategoriasController {
  constructor(private readonly service: IntegracaoCategoriasService) {}

  @ApiOperation({
    summary: 'Listar categorias',
    description: 'Paginado; filtra por ativo e busca por descrição.',
  })
  @ApiPaginationQuery()
  @Get()
  findAll(
    @Query() query: IntegracaoCategoriaQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findAll(integracao.empresaId, query);
  }

  @ApiOperation({ summary: 'Detalhar categoria por codigoErp' })
  @ApiParam({ name: 'codigo', description: 'codigoErp da categoria' })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_CATEGORIA_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Categoria não encontrada' })
  @Get(':codigo')
  findOne(
    @Param('codigo') codigo: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findOne(integracao.empresaId, codigo);
  }

  @ApiOperation({
    summary: 'Criar categoria',
    description:
      'categoriaPaiCodigo referencia outra categoria pelo codigoErp (precisa já existir).',
  })
  @ApiBodyExample(INTEGRACAO_CATEGORIA_CREATE_EXAMPLE)
  @ApiResponse({
    status: 201,
    schema: { example: INTEGRACAO_CATEGORIA_EXAMPLE },
  })
  @ApiResponse({
    status: 409,
    description: 'Já existe categoria com esse codigoErp',
  })
  @Post()
  create(
    @Body() dto: IntegracaoCategoriaCreateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.create(integracao.empresaId, integracao.apiKeyId, dto);
  }

  @ApiOperation({
    summary: 'Atualizar categoria',
    description: 'Atualização parcial — envie só os campos a mudar.',
  })
  @ApiParam({ name: 'codigo', description: 'codigoErp da categoria' })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_CATEGORIA_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Categoria não encontrada' })
  @Patch(':codigo')
  update(
    @Param('codigo') codigo: string,
    @Body() dto: IntegracaoCategoriaUpdateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.update(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
      dto,
    );
  }

  @ApiOperation({ summary: 'Excluir categoria (soft delete)' })
  @ApiParam({ name: 'codigo', description: 'codigoErp da categoria' })
  @ApiResponse({ status: 200, description: 'Excluída' })
  @ApiResponse({ status: 404, description: 'Categoria não encontrada' })
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
