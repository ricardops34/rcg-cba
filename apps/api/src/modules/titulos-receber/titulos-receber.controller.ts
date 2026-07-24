import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TitulosReceberService } from './titulos-receber.service';
import { TituloReceberQueryDto } from './dto/titulo-receber.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('titulos-receber')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('titulos-receber')
export class TitulosReceberController {
  constructor(private readonly service: TitulosReceberService) {}

  @ApiOperation({
    summary: 'Listar títulos a receber',
    description:
      'Títulos a receber da empresa ativa (consulta — dados entram pelo import do ERP), ' +
      'restritos ao escopo hierárquico do usuário logado. Busca por número ou razão social do ' +
      'cliente. Requer titulos-receber.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('titulos-receber', 'visualizar')
  @Get()
  findAll(@Query() query: TituloReceberQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, user, query);
  }

  @ApiOperation({ summary: 'Detalhar título', description: 'Requer titulos-receber.visualizar.' })
  @RequirePermission('titulos-receber', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, user, id);
  }
}
