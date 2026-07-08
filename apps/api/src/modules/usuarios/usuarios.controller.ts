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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsuariosService } from './usuarios.service';
import { UsuarioCreateDto, UsuarioUpdateDto } from './dto/usuario.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

@ApiTags('usuarios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly service: UsuariosService) {}

  @RequirePermission('usuarios', 'visualizar')
  @Get()
  findAll(@Query() query: PaginationQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @RequirePermission('usuarios', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @RequirePermission('usuarios', 'cadastrar')
  @Post()
  create(@Body() dto: UsuarioCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.empresaAtivaId, user.id);
  }

  @RequirePermission('usuarios', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UsuarioUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @RequirePermission('usuarios', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user.id);
  }

  @RequirePermission('usuarios', 'editar')
  @Post(':id/empresas/:empresaId')
  vincular(
    @Param('id') id: string,
    @Param('empresaId') empresaId: string,
    @Body('perfilId') perfilId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.vincularEmpresa(id, empresaId, perfilId, user.id);
  }

  @RequirePermission('usuarios', 'editar')
  @Delete(':id/empresas/:empresaId')
  desvincular(
    @Param('id') id: string,
    @Param('empresaId') empresaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.desvincularEmpresa(id, empresaId, user.id);
  }
}
