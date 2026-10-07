import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { createZodDto } from 'nestjs-zod';
import { integracaoComodatoAplicadaSchema } from '@plataforma/contracts';
import { IntegracaoEquipamentosComodatoService } from './integracao-equipamentos-comodato.service';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

class IntegracaoComodatoAplicadaDto extends createZodDto(
  integracaoComodatoAplicadaSchema,
) {}

@ApiTags('equipamentos-comodato')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/equipamentos-comodato')
export class IntegracaoEquipamentosComodatoController {
  constructor(
    private readonly service: IntegracaoEquipamentosComodatoService,
  ) {}

  @ApiOperation({
    summary: 'Listar equipamentos de comodato pendentes de envio ao ERP',
    description:
      'Fila de envio: equipamentos cujos produtos aplicáveis foram incluídos, alterados ou ' +
      'removidos (ou cujo cadastro mudou) desde a última confirmação. Cada item traz a **lista ' +
      'completa e atual** de aplicáveis — substitua a do ERP. Equipamento sem nenhum aplicável ' +
      'não aparece. Mais antigo primeiro. Guarde o `alteradoEm` de cada item: ele vai no PATCH ' +
      '.../aplicada.',
  })
  @ApiPaginationQuery()
  @Get('alteracoes')
  listarAlteracoes(
    @Query() query: PaginationQueryDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.listarPendentes(integracao.empresaId, query);
  }

  @ApiOperation({
    summary: 'Confirmar que o ERP gravou os aplicáveis do equipamento',
    description:
      'Tira o item da fila. Informe o `alteradoEm` lido no GET: se o equipamento mudou depois ' +
      'da leitura, responde 409 e o item segue pendente com a lista nova — leia de novo. 409 ' +
      'também quando já confirmado; 404 se o id não existir.',
  })
  @ApiParam({
    name: 'id',
    description: 'id do item (retornado no GET .../alteracoes)',
  })
  @ApiBodyExample({ alteradoEm: '2026-10-07T18:22:35.000Z' })
  @ApiResponse({ status: 404, description: 'Item não encontrado' })
  @ApiResponse({
    status: 409,
    description: 'Já confirmado, ou o equipamento mudou depois da leitura',
  })
  @Patch('alteracoes/:id/aplicada')
  marcarAplicada(
    @Param('id') id: string,
    @Body() dto: IntegracaoComodatoAplicadaDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.marcarAplicada(
      integracao.empresaId,
      id,
      dto.alteradoEm,
    );
  }
}
