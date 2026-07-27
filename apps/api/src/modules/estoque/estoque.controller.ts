import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EstoqueService } from './estoque.service';
import { EstoqueQueryDto } from './dto/estoque.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('estoque')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('estoque')
export class EstoqueController {
  constructor(private readonly service: EstoqueService) {}

  @ApiOperation({
    summary: 'Listar estoque',
    description:
      'Saldo de estoque por produto da empresa ativa, somado em todos os armazéns (ou só no ' +
      'armazém filtrado). Consulta — dados entram pelo import do ERP. Busca pela descrição ou ' +
      'código do produto. Requer estoque.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('estoque', 'visualizar')
  @Get()
  findAll(@Query() query: EstoqueQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({
    summary: 'Detalhar saldo do produto por armazém',
    description: 'Requer estoque.visualizar.',
  })
  @RequirePermission('estoque', 'visualizar')
  @Get(':produtoId')
  findByProduto(@Param('produtoId') produtoId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findByProduto(user.empresaAtivaId, produtoId);
  }
}
