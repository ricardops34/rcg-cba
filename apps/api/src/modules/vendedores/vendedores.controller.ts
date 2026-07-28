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
import { VendedoresService } from './vendedores.service';
import { VendedorCreateDto, VendedorQueryDto, VendedorUpdateDto } from './dto/vendedor.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('vendedores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('vendedores')
export class VendedoresController {
  constructor(private readonly service: VendedoresService) {}

  @ApiOperation({
    summary: 'Listar vendedores',
    description:
      'Cadastro de vendedores/supervisores/gerentes da empresa ativa. Busca por nome, código ERP ou e-mail. Requer vendedores.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('vendedores', 'visualizar')
  @Get()
  findAll(@Query() query: VendedorQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({ summary: 'Detalhar vendedor', description: 'Requer vendedores.visualizar.' })
  @RequirePermission('vendedores', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }

  @ApiOperation({ summary: 'Cadastrar vendedor', description: 'Requer vendedores.cadastrar.' })
  @RequirePermission('vendedores', 'cadastrar')
  @Post()
  create(@Body() dto: VendedorCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({ summary: 'Editar vendedor', description: 'Requer vendedores.editar.' })
  @RequirePermission('vendedores', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: VendedorUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({ summary: 'Excluir vendedor (soft delete)', description: 'Requer vendedores.excluir.' })
  @RequirePermission('vendedores', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Criar usuário de acesso para o vendedor',
    description:
      'Usa os dados do vendedor (nome, e-mail) e o perfil "Vendedor". Gera uma senha provisória ' +
      'e envia por e-mail; exige troca no primeiro login. Falha se o vendedor já tiver usuário, ' +
      'não tiver e-mail cadastrado, ou o e-mail já pertencer a outro usuário. Requer vendedores.editar.',
  })
  @RequirePermission('vendedores', 'editar')
  @Post(':id/criar-usuario')
  criarUsuario(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.criarUsuario(user.empresaAtivaId, user.id, id);
  }

  @ApiOperation({
    summary: 'Reenviar senha provisória do vendedor',
    description:
      'Gera uma nova senha provisória para o usuário já vinculado ao vendedor e reenvia por ' +
      'e-mail; exige troca no próximo login. Falha se o vendedor não tiver usuário associado. ' +
      'Requer vendedores.editar.',
  })
  @RequirePermission('vendedores', 'editar')
  @Post(':id/reenviar-senha')
  reenviarSenha(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.reenviarSenha(user.empresaAtivaId, user.id, id);
  }

  @ApiOperation({
    summary: 'Bloquear vendedor',
    description:
      'Marca o vendedor como inativo. Se houver usuário de acesso vinculado, bloqueia o ' +
      'usuário também. Requer vendedores.bloquear.',
  })
  @RequirePermission('vendedores', 'bloquear')
  @Patch(':id/bloquear')
  bloquear(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.bloquear(user.empresaAtivaId, user.id, id);
  }

  @ApiOperation({
    summary: 'Desbloquear vendedor',
    description:
      'Reativa o vendedor. Se houver usuário de acesso vinculado, reativa o usuário também. ' +
      'Requer vendedores.bloquear.',
  })
  @RequirePermission('vendedores', 'bloquear')
  @Patch(':id/desbloquear')
  desbloquear(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.desbloquear(user.empresaAtivaId, user.id, id);
  }
}
