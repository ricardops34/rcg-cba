import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TitulosReceberService } from './titulos-receber.service';
import {
  TituloReceberCreateDto,
  TituloReceberListQueryDto,
  TituloReceberUpdateDto,
} from './dto/titulo-receber.dto';
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
      'Vendedor vê apenas os próprios títulos; supervisor/gerente veem os de toda a equipe abaixo; ' +
      'admin vê todos. Filtros: clienteId, aberto (saldo > 0), vencido. Busca por número ou cliente. ' +
      'Requer titulos-receber.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('titulos-receber', 'visualizar')
  @Get()
  findAll(@Query() query: TituloReceberListQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, user, query);
  }

  @ApiOperation({ summary: 'Lançar título a receber', description: 'Requer titulos-receber.cadastrar.' })
  @RequirePermission('titulos-receber', 'cadastrar')
  @Post()
  create(@Body() dto: TituloReceberCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({ summary: 'Editar título a receber', description: 'Requer titulos-receber.editar.' })
  @RequirePermission('titulos-receber', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: TituloReceberUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({ summary: 'Excluir título a receber (soft delete)', description: 'Requer titulos-receber.excluir.' })
  @RequirePermission('titulos-receber', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
