import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CONSULTA_EVOLUCAO_RESULTADO_EXAMPLE,
  CONSULTA_VENDAS_RESULTADO_EXAMPLE,
} from '@plataforma/contracts';
import { ConsultasService } from './consultas.service';
import {
  ConsultaEvolucaoQueryDto,
  ConsultaVendasClienteQueryDto,
  ConsultaVendasProdutoQueryDto,
  ConsultaVendasVendedorQueryDto,
} from './dto/consulta.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

// Consultas gerenciais read-only: nada aqui grava. A exportação (PDF/Excel)
// é montada no navegador a partir do mesmo retorno destas rotas — quem pode
// visualizar já recebeu os números; a permissão `exportar` decide se os
// botões aparecem.
@ApiTags('consultas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('consultas')
export class ConsultasController {
  constructor(private readonly service: ConsultasService) {}

  @ApiOperation({
    summary: 'Vendas do período somadas mês a mês por cliente',
    description:
      'Uma linha por cliente com uma coluna por mês do período (mês/ano inicial a mês/ano ' +
      'final, no máximo 12 meses) e o total, ordenada pelo total (maior primeiro). Considera ' +
      'apenas nota de venda: ativa, não-comodato e do tipo Normal (devolução e remessa ficam ' +
      'de fora). O vendedor creditado (quem vendeu ou o titular da carteira) ' +
      'vem do parâmetro CONSULTA_VENDAS_BASE_VENDEDOR, e pode ser sobrescrito por ' +
      '?baseVendedor=. A visibilidade é sempre a carteira de clientes que o usuário alcança ' +
      '(escopo hierárquico), independente dessa escolha. Requer ' +
      'consulta-vendas-cliente.visualizar.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: CONSULTA_VENDAS_RESULTADO_EXAMPLE },
  })
  @RequirePermission('consulta-vendas-cliente', 'visualizar')
  @Get('vendas-cliente')
  vendasPorCliente(
    @Query() query: ConsultaVendasClienteQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.vendasPorCliente(user.empresaAtivaId, user, query);
  }

  @ApiOperation({
    summary: 'Vendas do período somadas mês a mês por vendedor',
    description:
      'Uma linha por vendedor com uma coluna por mês do período (máximo 12 meses) e o total, ' +
      'ordenada pelo total (maior primeiro). Mesma base da consulta por cliente (nota de venda ' +
      'ativa, não-comodato e do tipo Normal, vlrBruto). Com a base em `cliente`, a venda é ' +
      'creditada ao titular da ' +
      'carteira em vez de a quem emitiu a nota. Restrita à carteira de clientes que o usuário ' +
      'alcança. Requer consulta-vendas-vendedor.visualizar.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: CONSULTA_VENDAS_RESULTADO_EXAMPLE },
  })
  @RequirePermission('consulta-vendas-vendedor', 'visualizar')
  @Get('vendas-vendedor')
  vendasPorVendedor(
    @Query() query: ConsultaVendasVendedorQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.vendasPorVendedor(user.empresaAtivaId, user, query);
  }

  @ApiOperation({
    summary: 'Vendas do período somadas mês a mês por produto',
    description:
      'Uma linha por produto com uma coluna por mês do período (máximo 12 meses) e o total, ' +
      'ordenada pelo total (maior primeiro), com filtro opcional de categoria. Soma o vlrTotal ' +
      'dos itens de notas de venda (ativas, não-comodato, tipo Normal). Restrita à carteira de ' +
      'clientes que o usuário ' +
      'alcança. Requer consulta-vendas-produto.visualizar.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: CONSULTA_VENDAS_RESULTADO_EXAMPLE },
  })
  @RequirePermission('consulta-vendas-produto', 'visualizar')
  @Get('vendas-produto')
  vendasPorProduto(
    @Query() query: ConsultaVendasProdutoQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.vendasPorProduto(user.empresaAtivaId, user, query);
  }

  @ApiOperation({
    summary: 'Evolução mensal por vendedor no indicador escolhido',
    description:
      'Uma linha por vendedor com uma coluna por mês do período (máximo 12 meses) e o total — o ' +
      'mesmo formato das demais consultas, pensado para alimentar o gráfico de evolução. O ' +
      'parâmetro `indicador` escolhe o que é medido: `vendas` (faturamento do mês), ' +
      '`positivados` (clientes distintos que compraram no mês), `novos` (clientes cuja primeira ' +
      'compra de todo o histórico caiu no mês) ou `inativados` (clientes com data de bloqueio no ' +
      'mês). Os três primeiros usam a mesma base de nota de venda das outras consultas (ativa, ' +
      'não-comodato, tipo Normal) e respeitam `baseVendedor`; `inativados` parte do cadastro do ' +
      'cliente e credita sempre o vendedor titular. Restrita à carteira de clientes que o ' +
      'usuário alcança. Requer consulta-evolucao.visualizar.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: CONSULTA_EVOLUCAO_RESULTADO_EXAMPLE },
  })
  @RequirePermission('consulta-evolucao', 'visualizar')
  @Get('evolucao')
  evolucao(
    @Query() query: ConsultaEvolucaoQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.evolucao(user.empresaAtivaId, user, query);
  }
}
