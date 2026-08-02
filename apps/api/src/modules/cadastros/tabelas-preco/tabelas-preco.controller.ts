import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TabelasPrecoService } from './tabelas-preco.service';
import {
  TabelaPrecoItemQueryDto,
  TabelaPrecoQueryDto,
} from './dto/tabela-preco.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../common/decorators/current-user.decorator';

// Somente consulta: tabelas de preço e itens entram pelo import (e no futuro
// pela API externa de manutenção), não por esta API.
@ApiTags('tabelas-preco')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tabelas-preco')
export class TabelasPrecoController {
  constructor(private readonly service: TabelasPrecoService) {}

  @ApiOperation({
    summary: 'Listar tabelas de preço',
    description:
      'Tabelas de preço da empresa ativa. Busca por descrição ou código ERP. ' +
      'Requer tabelas-preco.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('tabelas-preco', 'visualizar')
  @Get()
  findAll(
    @Query() query: TabelaPrecoQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({
    summary: 'Detalhar tabela de preço',
    description: 'Requer tabelas-preco.visualizar.',
  })
  @RequirePermission('tabelas-preco', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }

  @ApiOperation({
    summary: 'Listar itens de uma tabela de preço',
    description:
      'Busca por descrição ou código ERP do produto. Requer tabelas-preco.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('tabelas-preco', 'visualizar')
  @Get(':id/itens')
  findAllItens(
    @Param('id') id: string,
    @Query() query: TabelaPrecoItemQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAllItens(user.empresaAtivaId, id, query);
  }
}
