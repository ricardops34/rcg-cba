import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { grupoEconomicoInputSchema, grupoUsuarioInputSchema } from '@plataforma/contracts';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { GruposEconomicosService } from './grupos-economicos.service';

class GrupoDto extends createZodDto(grupoEconomicoInputSchema) {}
class GrupoUsuarioDto extends createZodDto(grupoUsuarioInputSchema) {}

@ApiTags('grupos-economicos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('grupos-economicos')
export class GruposEconomicosController {
  constructor(private readonly service: GruposEconomicosService) {}

  @RequirePermission('grupo-economico', 'visualizar')
  @Get()
  contexto(@CurrentUser() user: AuthenticatedUser) { return this.service.contexto(user); }

  @RequirePermission('grupo-economico', 'cadastrar')
  @Post()
  criar(@Body() body: GrupoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.salvar(null, body, user);
  }

  @RequirePermission('grupo-economico', 'editar')
  @Put(':id')
  editar(@Param('id') id: string, @Body() body: GrupoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.salvar(id, body, user);
  }

  @RequirePermission('grupo-economico', 'visualizar')
  @Get(':id/usuarios')
  usuarios(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.usuarios(id, user);
  }

  @RequirePermission('grupo-economico', 'editar')
  @Post(':id/usuarios')
  salvarUsuario(@Param('id') id: string, @Body() body: GrupoUsuarioDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.salvarUsuario(id, body, user);
  }

  @RequirePermission('grupo-economico', 'editar')
  @Delete(':id/usuarios/:usuarioId/empresas/:empresaId')
  remover(@Param('id') id: string, @Param('usuarioId') usuarioId: string, @Param('empresaId') empresaId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removerAcesso(id, usuarioId, empresaId, user);
  }
}
