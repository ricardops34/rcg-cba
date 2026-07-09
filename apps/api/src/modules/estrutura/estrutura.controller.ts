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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  MENU_CREATE_EXAMPLE,
  MODULO_CREATE_EXAMPLE,
  ROTINA_CREATE_EXAMPLE,
} from '@plataforma/contracts';
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
import { ApiBodyExample } from '../../common/decorators/api-body-example.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

const MODULO_ID_EXAMPLE = 'seed-modulo-administracao';
const MENU_ID_EXAMPLE = 'seed-menu-colaboradores';
const ROTINA_ID_EXAMPLE = 'seed-rotina-colaboradores';

@ApiTags('estrutura-menu')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class EstruturaController {
  constructor(private readonly service: EstruturaService) {}

  // Módulos
  @ApiOperation({
    summary: 'Listar módulos (árvore do menu)',
    description:
      'Estrutura global do menu (não isolada por empresa), usada para montar o menu lateral. ' +
      'Disponível para qualquer usuário autenticado — o cliente filtra os itens visíveis pelas ' +
      'permissões de cada rotina. As mutações de estrutura continuam exigindo modulos.*.',
  })
  @Get('modulos')
  listModulos() {
    return this.service.listModulos();
  }

  @ApiOperation({ summary: 'Cadastrar módulo', description: 'Requer modulos.cadastrar.' })
  @ApiBodyExample(MODULO_CREATE_EXAMPLE)
  @RequirePermission('modulos', 'cadastrar')
  @Post('modulos')
  createModulo(@Body() dto: ModuloCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createModulo(dto, user.id);
  }

  @ApiOperation({ summary: 'Editar módulo', description: 'Requer modulos.editar.' })
  @ApiParam({ name: 'id', example: MODULO_ID_EXAMPLE })
  @ApiBodyExample({ ordem: 3 })
  @RequirePermission('modulos', 'editar')
  @Patch('modulos/:id')
  updateModulo(
    @Param('id') id: string,
    @Body() dto: ModuloUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateModulo(id, dto, user.id);
  }

  @ApiOperation({ summary: 'Excluir módulo (soft delete)', description: 'Requer modulos.excluir.' })
  @ApiParam({ name: 'id', example: MODULO_ID_EXAMPLE })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @RequirePermission('modulos', 'excluir')
  @Delete('modulos/:id')
  removeModulo(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removeModulo(id, user.id);
  }

  // Menus
  @ApiOperation({
    summary: 'Listar menus',
    description: 'Opcionalmente filtrado por moduloId. Inclui as rotinas de cada menu. Requer menus.visualizar.',
  })
  @ApiQuery({ name: 'moduloId', required: false, example: MODULO_ID_EXAMPLE })
  @RequirePermission('menus', 'visualizar')
  @Get('menus')
  listMenus(@Query('moduloId') moduloId?: string) {
    return this.service.listMenus(moduloId);
  }

  @ApiOperation({
    summary: 'Cadastrar menu',
    description: 'Use menuPaiId para criar um submenu. Requer menus.cadastrar.',
  })
  @ApiBodyExample(MENU_CREATE_EXAMPLE)
  @RequirePermission('menus', 'cadastrar')
  @Post('menus')
  createMenu(@Body() dto: MenuCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createMenu(dto, user.id);
  }

  @ApiOperation({ summary: 'Editar menu', description: 'Requer menus.editar.' })
  @ApiParam({ name: 'id', example: MENU_ID_EXAMPLE })
  @ApiBodyExample({ rota: '/comercial/vendedores' })
  @RequirePermission('menus', 'editar')
  @Patch('menus/:id')
  updateMenu(
    @Param('id') id: string,
    @Body() dto: MenuUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateMenu(id, dto, user.id);
  }

  @ApiOperation({ summary: 'Excluir menu (soft delete)', description: 'Requer menus.excluir.' })
  @ApiParam({ name: 'id', example: MENU_ID_EXAMPLE })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @RequirePermission('menus', 'excluir')
  @Delete('menus/:id')
  removeMenu(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removeMenu(id, user.id);
  }

  // Rotinas
  @ApiOperation({
    summary: 'Listar rotinas',
    description: 'Opcionalmente filtrado por menuId. O campo "codigo" é o identificador usado no RBAC. Requer rotinas.visualizar.',
  })
  @ApiQuery({ name: 'menuId', required: false, example: MENU_ID_EXAMPLE })
  @RequirePermission('rotinas', 'visualizar')
  @Get('rotinas')
  listRotinas(@Query('menuId') menuId?: string) {
    return this.service.listRotinas(menuId);
  }

  @ApiOperation({
    summary: 'Cadastrar rotina',
    description:
      'Cria uma rotina (funcionalidade permissionável). O "codigo" é o que aparece nas permissões, ex.: colaboradores.editar. Requer rotinas.cadastrar.',
  })
  @ApiBodyExample(ROTINA_CREATE_EXAMPLE)
  @RequirePermission('rotinas', 'cadastrar')
  @Post('rotinas')
  createRotina(@Body() dto: RotinaCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createRotina(dto, user.id);
  }

  @ApiOperation({ summary: 'Editar rotina', description: 'Requer rotinas.editar.' })
  @ApiParam({ name: 'id', example: ROTINA_ID_EXAMPLE })
  @ApiBodyExample({ nome: 'Colaboradores (Vendedores)' })
  @RequirePermission('rotinas', 'editar')
  @Patch('rotinas/:id')
  updateRotina(
    @Param('id') id: string,
    @Body() dto: RotinaUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateRotina(id, dto, user.id);
  }

  @ApiOperation({ summary: 'Excluir rotina (soft delete)', description: 'Requer rotinas.excluir.' })
  @ApiParam({ name: 'id', example: ROTINA_ID_EXAMPLE })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @RequirePermission('rotinas', 'excluir')
  @Delete('rotinas/:id')
  removeRotina(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removeRotina(id, user.id);
  }
}
