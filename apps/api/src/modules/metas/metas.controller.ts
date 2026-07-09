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
import { MetasService } from './metas.service';
import {
  AcompanhamentoQueryDto,
  MetaCreateDto,
  MetaListQueryDto,
  MetaUpdateDto,
} from './dto/meta.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('metas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('metas')
export class MetasController {
  constructor(private readonly service: MetasService) {}

  @ApiOperation({
    summary: 'Listar metas mensais da equipe supervisionada',
    description:
      'Retorna apenas as metas dos vendedores abaixo do usuário logado na hierarquia (admin vê todas). ' +
      'Aceita filtros ano e mes. Requer metas.visualizar.',
  })
  @RequirePermission('metas', 'visualizar')
  @Get()
  findAll(@Query() query: MetaListQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, user, query);
  }

  @ApiOperation({
    summary: 'Dashboard de acompanhamento da equipe no mês',
    description:
      'Consolida objetivo x realizado por vendedor da equipe supervisionada, com totais e ranking. ' +
      'Requer metas.visualizar.',
  })
  @RequirePermission('acompanhamento', 'visualizar')
  @Get('acompanhamento')
  acompanhamento(
    @Query() query: AcompanhamentoQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.acompanhamento(user.empresaAtivaId, user, query);
  }

  @ApiOperation({ summary: 'Cadastrar meta mensal de um vendedor', description: 'Requer metas.cadastrar.' })
  @RequirePermission('metas', 'cadastrar')
  @Post()
  create(@Body() dto: MetaCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({ summary: 'Editar meta / lançar realizado', description: 'Requer metas.editar.' })
  @RequirePermission('metas', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: MetaUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({ summary: 'Excluir meta (soft delete)', description: 'Requer metas.excluir.' })
  @RequirePermission('metas', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
