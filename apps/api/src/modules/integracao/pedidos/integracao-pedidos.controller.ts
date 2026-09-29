import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  Put,
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
  INTEGRACAO_PEDIDO_CREATE_EXAMPLE,
  INTEGRACAO_PEDIDO_EXAMPLE,
} from '@plataforma/contracts';
import { IntegracaoPedidosService } from './integracao-pedidos.service';
import {
  IntegracaoPedidoCreateDto,
  IntegracaoPedidoLoteDto,
} from './dto/integracao-pedido.dto';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { ApiBodyExample } from '../../../common/decorators/api-body-example.decorator';
import { ApiIntegracaoAuthResponses } from '../common/api-integracao-responses.decorator';

@ApiTags('pedidos')
@ApiSecurity('apiKey')
@ApiIntegracaoAuthResponses()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ApiKeyGuard)
@Controller('integracao/pedidos')
export class IntegracaoPedidosController {
  constructor(private readonly service: IntegracaoPedidosService) {}

  @ApiOperation({
    summary: 'Enviar a situação de um pedido',
    description:
      'Atualiza o orçamento que gerou o pedido: situação no ERP, quebra em ' +
      'relação ao orçamento e notas. O orçamento é achado pela chave do pedido ' +
      '(C5_FILIAL-C5_NUM), a mesma do vínculo. Não cria registro.',
  })
  @ApiBodyExample(INTEGRACAO_PEDIDO_CREATE_EXAMPLE)
  @ApiResponse({
    status: 200,
    schema: { example: INTEGRACAO_PEDIDO_EXAMPLE },
  })
  @ApiResponse({
    status: 404,
    description: 'Nenhum orçamento vinculado ao pedido',
  })
  @HttpCode(200)
  @Post()
  atualizar(
    @Body() dto: IntegracaoPedidoCreateDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.atualizar(
      integracao.empresaId,
      integracao.apiKeyId,
      dto,
    );
  }

  @ApiOperation({
    summary: 'Enviar lote de situações de pedido',
    description:
      'O mesmo do POST, em lote (máx. 1.000 por chamada). "excluido": true ' +
      'marca o orçamento como Cancelado e dispensa os demais campos. Pedido ' +
      'sem orçamento vinculado volta em "erros". Responde 200 com o relatório.',
  })
  @ApiBodyExample({ registros: [INTEGRACAO_PEDIDO_CREATE_EXAMPLE] })
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
    @Body() dto: IntegracaoPedidoLoteDto,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.upsertLote(
      integracao.empresaId,
      integracao.apiKeyId,
      dto.registros,
    );
  }

  @ApiOperation({
    summary: 'Pedido excluído no ERP',
    description: 'Marca o orçamento que gerou o pedido como Cancelado.',
  })
  @ApiParam({
    name: 'codigo',
    description: 'chave do pedido: C5_FILIAL-C5_NUM',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: { ...INTEGRACAO_PEDIDO_EXAMPLE, situacaoErp: 'cancelado' },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Nenhum orçamento vinculado ao pedido',
  })
  @Delete(':codigo')
  cancelar(
    @Param('codigo') codigo: string,
    @CurrentIntegracao() integracao: IntegracaoContext,
  ) {
    return this.service.cancelar(
      integracao.empresaId,
      integracao.apiKeyId,
      codigo,
    );
  }
}
