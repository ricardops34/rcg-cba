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
import { AtividadesService } from './atividades.service';
import {
  AtividadeCreateDto,
  AtividadeQueryDto,
  AtividadeUpdateDto,
} from './dto/atividade.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('atividades')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('atividades')
export class AtividadesController {
  constructor(private readonly service: AtividadesService) {}

  @ApiOperation({
    summary: 'Listar atividades',
    description:
      'Tarefas/interações comerciais, restritas ao escopo hierárquico do usuário logado. Busca ' +
      'por título, filtra por tipo, cliente, oportunidade, vendedor, concluída, ativo e ' +
      '"vencidas" (atalho: vencimento no passado e não concluída). Requer atividades.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('atividades', 'visualizar')
  @Get()
  findAll(@Query() query: AtividadeQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, user, query);
  }

  @ApiOperation({ summary: 'Detalhar atividade', description: 'Requer atividades.visualizar.' })
  @RequirePermission('atividades', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, user, id);
  }

  @ApiOperation({ summary: 'Cadastrar atividade', description: 'Requer atividades.cadastrar.' })
  @RequirePermission('atividades', 'cadastrar')
  @Post()
  create(@Body() dto: AtividadeCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({
    summary: 'Editar atividade',
    description:
      'Marcar concluida=true sem informar dataConclusao preenche com a data/hora atual; ' +
      'concluida=false limpa a data de conclusão. Requer atividades.editar.',
  })
  @RequirePermission('atividades', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: AtividadeUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Excluir atividade (soft delete)',
    description: 'Requer atividades.excluir.',
  })
  @RequirePermission('atividades', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
