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
      'Os perfis da plataforma (grupoEconomicoId nulo, valem para todos) e os do grupo econômico da ' +
      'empresa ativa. Requer perfis.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('perfis', 'visualizar')
  @Get()
  findAll(@Query() query: PerfilQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(query, user);
  }

  @ApiOperation({
    summary: 'Detalhar perfil, incluindo suas permissões por rotina/ação',
  })
  @ApiParam({ name: 'id', example: PERFIL_ID_EXAMPLE })
  @ApiResponse({ status: 404, description: 'Perfil não encontrado' })
  @RequirePermission('perfis', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(id, user);
  }

  @ApiOperation({
    summary: 'Cadastrar perfil',
    description:
      'O administrador da empresa cria o perfil no grupo econômico da empresa ativa; o administrador ' +
      'da plataforma cria perfil da plataforma, disponível para todas as empresas. Requer perfis.cadastrar.',
  })
  @ApiBodyExample(PERFIL_CREATE_EXAMPLE)
  @RequirePermission('perfis', 'cadastrar')
  @Post()
  create(@Body() dto: PerfilCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user);
  }

  @ApiOperation({
    summary: 'Editar perfil',
    description:
      'Requer perfis.editar. Perfil do grupo: o administrador da empresa edita. Perfil da plataforma ' +
      '(vale para todas as empresas): só o administrador da plataforma (403 para os demais).',
  })
  @ApiParam({ name: 'id', example: PERFIL_ID_EXAMPLE })
  @ApiBodyExample({ descricao: 'Acesso comercial padrão' })
  @RequirePermission('perfis', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: PerfilUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @ApiOperation({
    summary: 'Excluir perfil (soft delete)',
    description:
      'Perfis marcados como sistemaBase (ex.: Administrador Empresa) não podem ser excluídos. Requer perfis.excluir.',
  })
  @ApiParam({ name: 'id', example: PERFIL_ID_EXAMPLE })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @RequirePermission('perfis', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user);
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
    return this.service.updatePermissoes(id, dto, user);
  }
}
