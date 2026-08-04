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
import { OportunidadesService } from './oportunidades.service';
import {
  OportunidadeCreateDto,
  OportunidadeQueryDto,
  OportunidadeUpdateDto,
} from './dto/oportunidade.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('oportunidades')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('oportunidades')
export class OportunidadesController {
  constructor(private readonly service: OportunidadesService) {}

  @ApiOperation({
    summary: 'Listar oportunidades',
    description:
      'Funil de vendas, restrito ao escopo hierárquico do usuário logado. Busca por título, ' +
      'filtra por estágio, cliente, vendedor e ativo. Requer oportunidades.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('oportunidades', 'visualizar')
  @Get()
  findAll(@Query() query: OportunidadeQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, user, query);
  }

  @ApiOperation({ summary: 'Detalhar oportunidade', description: 'Requer oportunidades.visualizar.' })
  @RequirePermission('oportunidades', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, user, id);
  }

  @ApiOperation({ summary: 'Cadastrar oportunidade', description: 'Requer oportunidades.cadastrar.' })
  @RequirePermission('oportunidades', 'cadastrar')
  @Post()
  create(@Body() dto: OportunidadeCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({ summary: 'Editar oportunidade', description: 'Requer oportunidades.editar.' })
  @RequirePermission('oportunidades', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: OportunidadeUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Excluir oportunidade (soft delete)',
    description: 'Requer oportunidades.excluir.',
  })
  @RequirePermission('oportunidades', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
