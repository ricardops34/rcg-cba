import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  USUARIO_CREATE_EXAMPLE,
  USUARIO_EXAMPLE,
  USUARIO_HORARIOS_EXAMPLE,
} from '@plataforma/contracts';
import { UsuariosService } from './usuarios.service';
import {
  ResetPasswordDto,
  UsuarioCreateDto,
  UsuarioEmpresaCreateDto,
  UsuarioHorariosUpdateDto,
  UsuarioQueryDto,
  UsuarioUpdateDto,
} from './dto/usuario.dto';
import { AuthService } from '../auth/auth.service';
import { AvatarPadraoDto, UpdateRotinaInicialDto } from '../auth/dto/auth.dto';
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
  constructor(
    private readonly service: UsuariosService,
    private readonly auth: AuthService,
  ) {}

  // Foto e tela inicial: o administrador da empresa altera pelo cadastro o
  // mesmo que o usuário altera em "Meu perfil" (decisão de 30/09/2026). A
  // lógica é a do próprio perfil; aqui entra só a empresa ativa de quem edita,
  // e o usuário editado precisa ter vínculo ativo com ela.

  @ApiOperation({
    summary: 'Telas que o usuário pode ter como inicial na empresa ativa',
    description:
      'Uma por menu com tela, entre as rotinas que o usuário editado enxerga. Requer usuarios.visualizar.',
  })
  @ApiParam({ name: 'id', example: USUARIO_ID_EXAMPLE })
  @RequirePermission('usuarios', 'visualizar')
  @Get(':id/telas-iniciais')
  telasIniciais(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.auth.telasIniciais(id, user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Definir a tela inicial do usuário na empresa ativa',
    description:
      'Só aceita tela a que o usuário editado tem acesso; rotinaId null volta para a ' +
      'rotina inicial do perfil. Requer usuarios.editar.',
  })
  @ApiParam({ name: 'id', example: USUARIO_ID_EXAMPLE })
  @ApiBodyExample({ rotinaId: null })
  @RequirePermission('usuarios', 'editar')
  @Patch(':id/rotina-inicial')
  async definirRotinaInicial(
    @Param('id') id: string,
    @Body() dto: UpdateRotinaInicialDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.auth.updateRotinaInicial(
      id,
      user.empresaAtivaId,
      dto.rotinaId,
      user.id,
    );
    return this.auth.telasIniciais(id, user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Enviar a foto do usuário (PNG, JPEG ou WEBP, até 2 MB)',
    description: 'Requer usuarios.editar.',
  })
  @ApiParam({ name: 'id', example: USUARIO_ID_EXAMPLE })
  @RequirePermission('usuarios', 'editar')
  @Post(':id/foto')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    }),
  )
  async enviarFoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.auth.exigirVinculoAtivo(id, user.empresaAtivaId);
    await this.auth.uploadOwnAvatar(id, user.empresaAtivaId, file, user.id);
    return this.service.findOne(id, user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Escolher um avatar corporativo padrão para o usuário',
    description: 'Requer usuarios.editar.',
  })
  @ApiParam({ name: 'id', example: USUARIO_ID_EXAMPLE })
  @RequirePermission('usuarios', 'editar')
  @Patch(':id/avatar-padrao')
  async escolherAvatarPadrao(
    @Param('id') id: string,
    @Body() dto: AvatarPadraoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.auth.exigirVinculoAtivo(id, user.empresaAtivaId);
    await this.auth.selectDefaultAvatar(
      id,
      user.empresaAtivaId,
      dto.avatar,
      user.id,
    );
    return this.service.findOne(id, user.empresaAtivaId);
  }

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
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(id, user.empresaAtivaId);
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
    return this.service.create(
      dto,
      user.empresaAtivaId,
      user.id,
      user.administradorPlataforma === true,
    );
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
    summary: 'Redefinir a senha de outro usuário (reset por admin)',
    description:
      'Não exige a senha atual — uso do admin para o caso de usuário esquecido. ' +
      'A nova senha é validada contra a política vigente e o histórico de reuso. ' +
      'Por padrão, força a troca no próximo login (deveTrocarSenha). Requer usuarios.editar.',
  })
  @ApiParam({ name: 'id', example: USUARIO_ID_EXAMPLE })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @ApiResponse({ status: 400, description: 'Nova senha não atende à política vigente' })
  @RequirePermission('usuarios', 'editar')
  @Patch(':id/senha')
  resetSenha(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.resetSenha(id, dto, user.id);
  }

  @ApiOperation({
    summary: 'Consultar o horário de trabalho do usuário',
    description:
      'Faixas de expediente por dia da semana e o flag que liga a restrição. ' +
      'Requer usuarios.visualizar.',
  })
  @ApiParam({ name: 'id', example: USUARIO_ID_EXAMPLE })
  @ApiResponse({ status: 200, schema: { example: USUARIO_HORARIOS_EXAMPLE } })
  @RequirePermission('usuarios', 'visualizar')
  @Get(':id/horarios')
  horarios(@Param('id') id: string) {
    return this.service.obterHorarios(id);
  }

  @ApiOperation({
    summary: 'Definir o horário de trabalho do usuário',
    description:
      'Substitui o conjunto de faixas (uma por dia da semana, no máximo). Com ' +
      'restringirHorario = true, o usuário só consegue autenticar e usar o sistema dentro ' +
      'dessas faixas, no fuso da operação (America/Campo_Grande); dia sem faixa é dia sem ' +
      'acesso. Requer usuarios.editar.',
  })
  @ApiParam({ name: 'id', example: USUARIO_ID_EXAMPLE })
  @ApiBodyExample(USUARIO_HORARIOS_EXAMPLE)
  @ApiResponse({ status: 200, schema: { example: USUARIO_HORARIOS_EXAMPLE } })
  @RequirePermission('usuarios', 'editar')
  @Put(':id/horarios')
  salvarHorarios(
    @Param('id') id: string,
    @Body() dto: UsuarioHorariosUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.salvarHorarios(id, dto, user.id);
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
    summary: 'Dar acesso a uma empresa do grupo e gravar perfil e dados do usuário',
    description:
      'Dá (ou confirma) o acesso do usuário à empresa informada e grava o perfil (RBAC), o ' +
      'superior (outro usuário do grupo) e os dados dele — que são da conta, iguais em todas ' +
      'as empresas do grupo. Conta de outro grupo econômico é recusada. Requer usuarios.editar.',
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
    return this.service.vincularEmpresa(
      id,
      empresaId,
      dto,
      user.id,
      user.administradorPlataforma === true,
    );
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
    return this.service.desvincularEmpresa(id, empresaId, user.id, user.empresaAtivaId);
  }
}
