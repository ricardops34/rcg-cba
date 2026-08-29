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
import {
  PERFIL_CREATE_EXAMPLE,
  PERFIL_PERMISSOES_UPDATE_EXAMPLE,
} from '@plataforma/contracts';
import { PerfisService } from './perfis.service';
import {
  PerfilCreateDto,
  PerfilPermissoesUpdateDto,
  PerfilQueryDto,
  PerfilUpdateDto,
} from './dto/perfil.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
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
    summary: 'Listar perfis',
    description:
      'Perfis (papéis RBAC) são globais, compartilhados por todas as empresas. Requer perfis.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('perfis', 'visualizar')
  @Get()
  findAll(@Query() query: PerfilQueryDto) {
    return this.service.findAll(query);
  }

  @ApiOperation({
    summary: 'Detalhar perfil, incluindo suas permissões por rotina/ação',
  })
  @ApiParam({ name: 'id', example: PERFIL_ID_EXAMPLE })
  @ApiResponse({ status: 404, description: 'Perfil não encontrado' })
  @RequirePermission('perfis', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @ApiOperation({
    summary: 'Cadastrar perfil',
    description:
      'Cria um novo perfil (papel), disponível para todas as empresas. Requer perfis.cadastrar. ' +
      'Atenção: como o perfil é global, essa permissão concedida em qualquer empresa afeta todas as demais.',
  })
  @ApiBodyExample(PERFIL_CREATE_EXAMPLE)
  @UseGuards(PlatformAdminGuard)
  @RequirePermission('perfis', 'cadastrar')
  @Post()
  create(@Body() dto: PerfilCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.id);
  }

  @ApiOperation({
    summary: 'Editar perfil',
    description:
      'Requer perfis.editar. Atenção: como o perfil é global, a edição afeta todas as empresas que o utilizam.',
  })
  @ApiParam({ name: 'id', example: PERFIL_ID_EXAMPLE })
  @ApiBodyExample({ descricao: 'Acesso comercial padrão' })
  @UseGuards(PlatformAdminGuard)
  @RequirePermission('perfis', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: PerfilUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @ApiOperation({
    summary: 'Excluir perfil (soft delete)',
    description:
      'Perfis marcados como sistemaBase (ex.: Administrador) não podem ser excluídos. Requer perfis.excluir.',
  })
  @ApiParam({ name: 'id', example: PERFIL_ID_EXAMPLE })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @UseGuards(PlatformAdminGuard)
  @RequirePermission('perfis', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user.id);
  }

  @ApiOperation({
    summary: 'Definir permissões do perfil',
    description:
      'Substitui (upsert) as permissões informadas para o perfil, por combinação de rotina + ação. ' +
      'Permissões não incluídas na lista permanecem como estavam. Requer perfis.editar.',
  })
  @ApiParam({ name: 'id', example: PERFIL_ID_EXAMPLE })
  @ApiBodyExample(PERFIL_PERMISSOES_UPDATE_EXAMPLE)
  @UseGuards(PlatformAdminGuard)
  @RequirePermission('perfis', 'editar')
  @Put(':id/permissoes')
  updatePermissoes(
    @Param('id') id: string,
    @Body() dto: PerfilPermissoesUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updatePermissoes(id, dto, user.id);
  }
}
