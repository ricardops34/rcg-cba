import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import {
  relatorioComprasQuerySchema,
  relatorioEstoqueCompraQuerySchema,
  relatorioVendasQuerySchema,
} from '@plataforma/contracts';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { RelatoriosService } from './relatorios.service';

/** Página maior que isto é exportação (PDF/Excel), não tela. */
const MAXIMO_DA_TELA = 200;

/**
 * Exportar é ação própria do perfil: a tela pagina de até 200 linhas, e pedir
 * mais que isso é baixar o relatório. O administrador tem tudo pelo isAdmin.
 */
function exigirExportarSeGrande(
  user: AuthenticatedUser,
  rotina: string,
  pageSize: number,
) {
  if (pageSize <= MAXIMO_DA_TELA || user.isAdmin) return;
  if (!user.permissoes.includes(`${rotina}.exportar`)) {
    throw new ForbiddenException(
      'Seu perfil pode ver este relatório, mas não exportar (PDF/Excel).',
    );
  }
}

class RelatorioComprasQueryDto extends createZodDto(
  relatorioComprasQuerySchema,
) {}
class RelatorioVendasQueryDto extends createZodDto(
  relatorioVendasQuerySchema,
) {}
class RelatorioEstoqueCompraQueryDto extends createZodDto(
  relatorioEstoqueCompraQuerySchema,
) {}

/**
 * Módulo de Relatórios (docs/planos/2026-10-13-modulo-relatorios.md): Gerente,
 * Administrativo e os administradores. Sempre da empresa ativa.
 */
@ApiTags('relatorios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('relatorios')
export class RelatoriosController {
  constructor(private readonly service: RelatoriosService) {}

  @ApiOperation({
    summary:
      'Compras: itens das notas de entrada no período (data de digitação)',
  })
  @RequirePermission('relatorio-compras', 'visualizar')
  @Get('compras')
  compras(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: RelatorioComprasQueryDto,
  ) {
    exigirExportarSeGrande(user, 'relatorio-compras', q.pageSize);
    return this.service.compras(user.empresaAtivaId, q);
  }

  @ApiOperation({
    summary: 'Vendas por vendedor: itens de venda no período (emissão)',
  })
  @RequirePermission('relatorio-vendas', 'visualizar')
  @Get('vendas')
  vendas(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: RelatorioVendasQueryDto,
  ) {
    exigirExportarSeGrande(user, 'relatorio-vendas', q.pageSize);
    return this.service.vendas(user.empresaAtivaId, q);
  }

  @ApiOperation({
    summary:
      'Estoque e compra: estoque, entradas, saídas, média e quanto comprar por produto',
  })
  @RequirePermission('relatorio-estoque-compra', 'visualizar')
  @Get('estoque-compra')
  estoqueCompra(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: RelatorioEstoqueCompraQueryDto,
  ) {
    return this.service.estoqueCompra(user.empresaAtivaId, q);
  }
}
