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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { USUARIO_CREATE_EXAMPLE, USUARIO_EXAMPLE } from '@plataforma/contracts';
import { UsuariosService } from './usuarios.service';
import {
  UsuarioCreateDto,
  UsuarioEmpresaCreateDto,
  UsuarioQueryDto,
  UsuarioUpdateDto,
} from './dto/usuario.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiBodyExample } from '../../common/decorators/api-body-example.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';

const USUARIO_ID_EXAMPLE = USUARIO_EXAMPLE.id;
const EMPRESA_ID_EXAMPLE = '2113ce67-5cf9-40e6-b1ed-fa88281c2a92';

@ApiTags('usuarios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly service: UsuariosService) {}

  @ApiOperation({
    summary: 'Listar usuários da empresa ativa',
    description:
      'Retorna apenas usuários vinculados (ativos) à empresa ativa da sessão. Requer usuarios.visualizar.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: { data: [USUARIO_EXAMPLE], total: 1, page: 1, pageSize: 20, totalPages: 1 } },
  })
  @ApiPaginationQuery()
  @RequirePermission('usuarios', 'visualizar')
  @Get()
  findAll(@Query() query: UsuarioQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({ summary: 'Detalhar usuário, incluindo suas empresas e perfis vinculados' })
  @ApiParam({ name: 'id', example: USUARIO_ID_EXAMPLE })
  @ApiResponse({ status: 200, schema: { example: USUARIO_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  @RequirePermission('usuarios', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @ApiOperation({
    summary: 'Cadastrar usuário',
    description:
      'Cria o usuário e já o vincula à empresa ativa com o perfil informado em perfilId. ' +
      'Requer usuarios.cadastrar. A senha é armazenada como hash bcrypt.',
  })
  @ApiBodyExample(USUARIO_CREATE_EXAMPLE)
  @ApiResponse({ status: 201, schema: { example: USUARIO_EXAMPLE } })
  @ApiResponse({ status: 409, description: 'E-mail já cadastrado' })
  @RequirePermission('usuarios', 'cadastrar')
  @Post()
  create(@Body() dto: UsuarioCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.empresaAtivaId, user.id);
  }

  @ApiOperation({ summary: 'Editar dados do usuário (não altera senha nem vínculos)' })
  @ApiParam({ name: 'id', example: USUARIO_ID_EXAMPLE })
  @ApiBodyExample({ nome: 'Maria Souza Lima', ativo: true })
  @ApiResponse({ status: 200, schema: { example: USUARIO_EXAMPLE } })
  @RequirePermission('usuarios', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UsuarioUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @ApiOperation({
    summary: 'Excluir usuário (soft delete)',
    description: 'Marca o usuário como excluído e inativo. Requer usuarios.excluir.',
  })
  @ApiParam({ name: 'id', example: USUARIO_ID_EXAMPLE })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @RequirePermission('usuarios', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user.id);
  }

  @ApiOperation({
    summary: 'Vincular usuário a outra empresa (ou editar um vínculo existente)',
    description:
      'Cria ou edita o vínculo do usuário com a empresa informada: perfil (RBAC) + ' +
      'hierarquia/dados de vendedor. Mesma rota serve pra vincular a uma empresa nova e pra ' +
      'completar/editar um vínculo já existente. Requer usuarios.editar.',
  })
  @ApiParam({ name: 'id', example: USUARIO_ID_EXAMPLE })
  @ApiParam({ name: 'empresaId', example: EMPRESA_ID_EXAMPLE })
  @ApiBodyExample({ perfilId: '06b281c4-c6d6-454c-82c6-75106224bbfc' })
  @ApiResponse({ status: 201, description: 'Vínculo criado/atualizado' })
  @RequirePermission('usuarios', 'editar')
  @Post(':id/empresas/:empresaId')
  vincular(
    @Param('id') id: string,
    @Param('empresaId') empresaId: string,
    @Body() dto: UsuarioEmpresaCreateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.vincularEmpresa(id, empresaId, dto, user.id);
  }

  @ApiOperation({
    summary: 'Desvincular usuário de uma empresa',
    description: 'Desativa o vínculo (o usuário deixa de conseguir logar nesta empresa). Requer usuarios.editar.',
  })
  @ApiParam({ name: 'id', example: USUARIO_ID_EXAMPLE })
  @ApiParam({ name: 'empresaId', example: EMPRESA_ID_EXAMPLE })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
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
