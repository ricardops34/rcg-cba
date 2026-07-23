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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PERFIL_CREATE_EXAMPLE, PERFIL_PERMISSOES_UPDATE_EXAMPLE } from '@plataforma/contracts';
import { PerfisService } from './perfis.service';
import {
  PerfilCreateDto,
  PerfilPermissoesUpdateDto,
  PerfilQueryDto,
  PerfilUpdateDto,
} from './dto/perfil.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiBodyExample } from '../../common/decorators/api-body-example.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';

const PERFIL_ID_EXAMPLE = '06b281c4-c6d6-454c-82c6-75106224bbfc';

@ApiTags('perfis')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('perfis')
export class PerfisController {
  constructor(private readonly service: PerfisService) {}

  @ApiOperation({
    summary: 'Listar perfis da empresa ativa',
    description: 'Requer perfis.visualizar. Isolado por Row-Level Security no Postgres.',
  })
  @ApiPaginationQuery()
  @RequirePermission('perfis', 'visualizar')
  @Get()
  findAll(@Query() query: PerfilQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({ summary: 'Detalhar perfil, incluindo suas permissões por rotina/ação' })
  @ApiParam({ name: 'id', example: PERFIL_ID_EXAMPLE })
  @ApiResponse({ status: 404, description: 'Perfil não encontrado' })
  @RequirePermission('perfis', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }

  @ApiOperation({
    summary: 'Cadastrar perfil',
    description: 'Cria um novo perfil (papel) na empresa ativa. Requer perfis.cadastrar.',
  })
  @ApiBodyExample(PERFIL_CREATE_EXAMPLE)
  @RequirePermission('perfis', 'cadastrar')
  @Post()
  create(@Body() dto: PerfilCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.empresaAtivaId, dto, user.id);
  }

  @ApiOperation({ summary: 'Editar perfil', description: 'Requer perfis.editar.' })
  @ApiParam({ name: 'id', example: PERFIL_ID_EXAMPLE })
  @ApiBodyExample({ descricao: 'Acesso comercial padrão' })
  @RequirePermission('perfis', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: PerfilUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, id, dto, user.id);
  }

  @ApiOperation({
    summary: 'Excluir perfil (soft delete)',
    description: 'Perfis marcados como sistemaBase (ex.: Administrador) não podem ser excluídos. Requer perfis.excluir.',
  })
  @ApiParam({ name: 'id', example: PERFIL_ID_EXAMPLE })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @RequirePermission('perfis', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, id, user.id);
  }

  @ApiOperation({
    summary: 'Definir permissões do perfil',
    description:
      'Substitui (upsert) as permissões informadas para o perfil, por combinação de rotina + ação. ' +
      'Permissões não incluídas na lista permanecem como estavam. Requer perfis.editar.',
  })
  @ApiParam({ name: 'id', example: PERFIL_ID_EXAMPLE })
  @ApiBodyExample(PERFIL_PERMISSOES_UPDATE_EXAMPLE)
  @RequirePermission('perfis', 'editar')
  @Put(':id/permissoes')
  updatePermissoes(
    @Param('id') id: string,
    @Body() dto: PerfilPermissoesUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updatePermissoes(user.empresaAtivaId, id, dto, user.id);
  }
}
