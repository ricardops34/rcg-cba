import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArmazensService } from './armazens.service';
import { ArmazemQueryDto } from './dto/armazem.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../common/decorators/current-user.decorator';

// Somente consulta: armazéns entram pelo import (e no futuro pela API
// externa de manutenção), não por esta API.
@ApiTags('armazens')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('armazens')
export class ArmazensController {
  constructor(private readonly service: ArmazensService) {}

  @ApiOperation({
    summary: 'Listar armazéns',
    description:
      'Armazéns da empresa ativa. Busca por descrição ou código ERP. Requer armazens.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('armazens', 'visualizar')
  @Get()
  findAll(
    @Query() query: ArmazemQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({
    summary: 'Detalhar armazém',
    description: 'Requer armazens.visualizar.',
  })
  @RequirePermission('armazens', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }
}
