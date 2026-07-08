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
import { EstruturaService } from './estrutura.service';
import {
  MenuCreateDto,
  MenuUpdateDto,
  ModuloCreateDto,
  ModuloUpdateDto,
  RotinaCreateDto,
  RotinaUpdateDto,
} from './dto/estrutura.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('estrutura-menu')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class EstruturaController {
  constructor(private readonly service: EstruturaService) {}

  // Módulos
  @RequirePermission('modulos', 'visualizar')
  @Get('modulos')
  listModulos() {
    return this.service.listModulos();
  }

  @RequirePermission('modulos', 'cadastrar')
  @Post('modulos')
  createModulo(@Body() dto: ModuloCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createModulo(dto, user.id);
  }

  @RequirePermission('modulos', 'editar')
  @Patch('modulos/:id')
  updateModulo(
    @Param('id') id: string,
    @Body() dto: ModuloUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateModulo(id, dto, user.id);
  }

  @RequirePermission('modulos', 'excluir')
  @Delete('modulos/:id')
  removeModulo(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removeModulo(id, user.id);
  }

  // Menus
  @RequirePermission('menus', 'visualizar')
  @Get('menus')
  listMenus(@Query('moduloId') moduloId?: string) {
    return this.service.listMenus(moduloId);
  }

  @RequirePermission('menus', 'cadastrar')
  @Post('menus')
  createMenu(@Body() dto: MenuCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createMenu(dto, user.id);
  }

  @RequirePermission('menus', 'editar')
  @Patch('menus/:id')
  updateMenu(
    @Param('id') id: string,
    @Body() dto: MenuUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateMenu(id, dto, user.id);
  }

  @RequirePermission('menus', 'excluir')
  @Delete('menus/:id')
  removeMenu(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removeMenu(id, user.id);
  }

  // Rotinas
  @RequirePermission('rotinas', 'visualizar')
  @Get('rotinas')
  listRotinas(@Query('menuId') menuId?: string) {
    return this.service.listRotinas(menuId);
  }

  @RequirePermission('rotinas', 'cadastrar')
  @Post('rotinas')
  createRotina(@Body() dto: RotinaCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createRotina(dto, user.id);
  }

  @RequirePermission('rotinas', 'editar')
  @Patch('rotinas/:id')
  updateRotina(
    @Param('id') id: string,
    @Body() dto: RotinaUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateRotina(id, dto, user.id);
  }

  @RequirePermission('rotinas', 'excluir')
  @Delete('rotinas/:id')
  removeRotina(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removeRotina(id, user.id);
  }
}
