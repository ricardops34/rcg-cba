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
  INTEGRACAO_REGRA_DESCONTO_CREATE_EXAMPLE,
  INTEGRACAO_REGRA_DESCONTO_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoRegrasDescontoService } from './integracao-regras-desconto.service';
import {
  IntegracaoRegraDescontoCreateDto,
  IntegracaoRegraDescontoLoteDto,
  IntegracaoRegraDescontoQueryDto,
  IntegracaoRegraDescontoUpdateDto,
} from './dto/integracao-regra-desconto.dto';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';

@ApiTags('regras-desconto')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/regras-desconto')
export class IntegracaoRegrasDescontoController {
  constructor(private readonly service: IntegracaoRegrasDescontoService) {}

  @ApiOperation({
    summary: 'Listar regras de desconto',
    description:
      'Paginado; filtra por ativo e busca por descrição. As faixas vêm embutidas em cada regra.',
  })
  @ApiPaginationQuery()
  @Get()
  findAll(
    @Query() query: IntegracaoRegraDescontoQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findAll(integracao.empresaId, query);
  }

  @ApiOperation({ summary: 'Detalhar regra de desconto por codigoErp' })
  @ApiParam({ name: 'codigo', description: 'codigoErp da regra (Z0_CODIGO)' })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_REGRA_DESCONTO_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Regra não encontrada' })
  @Get(':codigo')
  findOne(
    @Param('codigo') codigo: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findOne(integracao.empresaId, codigo);
  }

  @ApiOperation({
    summary: 'Criar regra de desconto',
    description:
      'As faixas vêm no mesmo corpo. Faixas com sequência repetida ou intervalos que se ' +
      'sobrepõem são recusadas (400). Marcar padrao=true tira o padrão da regra anterior.',
  })
  @ApiBodyExample(INTEGRACAO_REGRA_DESCONTO_CREATE_EXAMPLE)
  @ApiResponse({
    status: 201,
    schema: { example: INTEGRACAO_REGRA_DESCONTO_EXAMPLE },
  })
  @ApiResponse({
    status: 409,
    description: 'Já existe regra com esse codigoErp',
  })
  @Post()
  create(
    @Body() dto: IntegracaoRegraDescontoCreateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.create(integracao.empresaId, integracao.apiKeyId, dto);
  }

  @ApiOperation({
    summary: 'Enviar lote de regras-desconto',
    description:
      'Upsert em lote por codigoErp (máx. 1.000 por chamada). Um registro com ' +
      '"excluido": true é excluído (soft delete) e dispensa os demais campos. ' +
      'Responde 200 com o relatório: um item inválido não desfaz os que já ' +
      'passaram, e vem listado em "erros" com o índice no array enviado.',
  })
  @ApiBodyExample({ registros: [INTEGRACAO_REGRA_DESCONTO_CREATE_EXAMPLE] })
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
    @Body() dto: IntegracaoRegraDescontoLoteDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.upsertLote(
      integracao.empresaId,
      integracao.apiKeyId,
      dto.registros,
    );
  }

  @ApiOperation({
    summary: 'Atualizar regra de desconto',
    description:
      'Atualização parcial — faixa com delete=true exclui somente a sequência indicada; ' +
      'as demais são incluídas ou atualizadas.',
  })
  @ApiParam({ name: 'codigo', description: 'codigoErp da regra (Z0_CODIGO)' })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_REGRA_DESCONTO_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Regra não encontrada' })
  @Patch(':codigo')
  update(
    @Param('codigo') codigo: string,
    @Body() dto: IntegracaoRegraDescontoUpdateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.update(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
      dto,
    );
  }

  @ApiOperation({ summary: 'Excluir regra de desconto (soft delete)' })
  @ApiParam({ name: 'codigo', description: 'codigoErp da regra (Z0_CODIGO)' })
  @ApiResponse({ status: 200, description: 'Excluída' })
  @ApiResponse({ status: 404, description: 'Regra não encontrada' })
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
