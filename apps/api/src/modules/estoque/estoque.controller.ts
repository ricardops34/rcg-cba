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
      'Saldo de estoque por produto/armazém da empresa ativa (consulta — dados entram pelo ' +
      'import do ERP). Busca pela descrição ou código do produto. Requer estoque.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('estoque', 'visualizar')
  @Get()
  findAll(@Query() query: EstoqueQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({ summary: 'Detalhar registro de estoque', description: 'Requer estoque.visualizar.' })
  @RequirePermission('estoque', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }
}
