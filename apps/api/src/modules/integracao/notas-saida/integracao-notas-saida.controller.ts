import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
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
  INTEGRACAO_NFE_XML_EXAMPLE,
  INTEGRACAO_NFE_XML_RESULTADO_EXAMPLE,
  INTEGRACAO_NOTA_SAIDA_CREATE_EXAMPLE,
  INTEGRACAO_NOTA_SAIDA_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoNotasSaidaService } from './integracao-notas-saida.service';
import {
  IntegracaoNfeXmlDto,
  IntegracaoNotaSaidaCreateDto,
  IntegracaoNotaSaidaQueryDto,
  IntegracaoNotaSaidaUpdateDto,
} from './dto/integracao-nota-saida.dto';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';

@ApiTags('notas-saida')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/notas-saida')
export class IntegracaoNotasSaidaController {
  constructor(private readonly service: IntegracaoNotasSaidaService) {}

  @ApiOperation({
    summary: 'Listar notas de saída',
    description: 'Paginado; filtra por ativo e busca por número.',
  })
  @ApiPaginationQuery()
  @Get()
  findAll(
    @Query() query: IntegracaoNotaSaidaQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findAll(integracao.empresaId, query);
  }

  @ApiOperation({ summary: 'Detalhar nota de saída por codigoLegado' })
  @ApiParam({
    name: 'codigo',
    description: 'codigoLegado (id da linha no ERP)',
  })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_NOTA_SAIDA_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Nota de saída não encontrada' })
  @Get(':codigo')
  findOne(
    @Param('codigo', ParseIntPipe) codigo: number,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.findOne(integracao.empresaId, codigo);
  }

  @ApiOperation({
    summary: 'Criar nota de saída',
    description:
      'clienteCodigo/vendedorCodigo/condicaoCodigo e, nos itens, produtoCodigo referenciam os ' +
      'respectivos cadastros pelo codigoErp.',
  })
  @ApiBodyExample(INTEGRACAO_NOTA_SAIDA_CREATE_EXAMPLE)
  @ApiResponse({
    status: 201,
    schema: { example: INTEGRACAO_NOTA_SAIDA_EXAMPLE },
  })
  @ApiResponse({
    status: 409,
    description: 'Já existe nota de saída com esse codigoLegado',
  })
  @Post()
  create(
    @Body() dto: IntegracaoNotaSaidaCreateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.create(integracao.empresaId, integracao.apiKeyId, dto);
  }

  @ApiOperation({
    summary: 'Atualizar nota de saída',
    description:
      'Atualização parcial. Se "itens" for enviado, substitui o conjunto inteiro de itens.',
  })
  @ApiParam({
    name: 'codigo',
    description: 'codigoLegado (id da linha no ERP)',
  })
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_NOTA_SAIDA_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Nota de saída não encontrada' })
  @Patch(':codigo')
  update(
    @Param('codigo', ParseIntPipe) codigo: number,
    @Body() dto: IntegracaoNotaSaidaUpdateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.update(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
      dto,
    );
  }

  @ApiOperation({ summary: 'Excluir nota de saída (soft delete)' })
  @ApiParam({
    name: 'codigo',
    description: 'codigoLegado (id da linha no ERP)',
  })
  @ApiResponse({ status: 200, description: 'Excluída' })
  @ApiResponse({ status: 404, description: 'Nota de saída não encontrada' })
  @Delete(':codigo')
  remove(
    @Param('codigo', ParseIntPipe) codigo: number,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.remove(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
    );
  }

  @ApiOperation({
    summary: 'Enviar o XML autorizado da NF-e',
    description:
      'Guarda o XML (nfeProc) da nota para a 2ª via do DANFE. Envie "xml" em texto ou ' +
      '"xmlBase64" — exatamente um dos dois. A plataforma extrai chave, protocolo e situação ' +
      'do próprio arquivo, e recusa (409) XML que não seja NF-e ou cuja chave não confira com ' +
      'a da nota. Reenviar substitui o XML anterior.',
  })
  @ApiParam({ name: 'codigo', description: 'codigoLegado (id da linha no ERP)' })
  @ApiBodyExample(INTEGRACAO_NFE_XML_EXAMPLE)
  @ApiResponse({
    status: 201,
    schema: { example: INTEGRACAO_NFE_XML_RESULTADO_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Nota de saída não encontrada' })
  @ApiResponse({
    status: 409,
    description: 'XML inválido, acima do limite, ou com chave divergente da nota',
  })
  // Limite próprio: o XML é bem maior que um payload de nota, e uma carga
  // retroativa de milhares de arquivos não pode competir com o cadastro no
  // mesmo balde do throttler.
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post(':codigo/xml')
  enviarXml(
    @Param('codigo', ParseIntPipe) codigo: number,
    @Body() dto: IntegracaoNfeXmlDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.salvarXml(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
      dto,
    );
  }
}
