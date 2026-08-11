import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CONSULTA_VENDAS_RESULTADO_EXAMPLE } from '@plataforma/contracts';
import { ConsultasService } from './consultas.service';
import {
  ConsultaVendasClienteQueryDto,
  ConsultaVendasProdutoQueryDto,
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
    summary: 'Vendas por vendedor/ano, somadas mês a mês por cliente',
    description:
      'Uma linha por cliente com os 12 meses do ano e o total, ordenada pelo total (maior ' +
      'primeiro). Considera nota ativa e não-comodato. O vendedor considerado (quem vendeu ou ' +
      'o titular da carteira) vem do parâmetro CONSULTA_VENDAS_BASE_VENDEDOR. Restrita ao ' +
      'escopo hierárquico do usuário. Requer consulta-vendas-cliente.visualizar.',
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
    summary: 'Vendas por vendedor/ano, somadas mês a mês por produto',
    description:
      'Uma linha por produto com os 12 meses do ano e o total, ordenada pelo total (maior ' +
      'primeiro), com filtro opcional de categoria. Soma o vlrTotal dos itens de notas ativas ' +
      'e não-comodato. Restrita ao escopo hierárquico do usuário. Requer ' +
      'consulta-vendas-produto.visualizar.',
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
}
