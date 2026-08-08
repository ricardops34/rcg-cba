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
import { ObjetivosService } from './objetivos.service';
import {
  ObjetivoCopiarPeriodoDto,
  ObjetivoCreateDto,
  ObjetivoDashboardQueryDto,
  ObjetivoQueryDto,
  ObjetivoUpdateDto,
} from './dto/objetivo.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('objetivos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('objetivos')
export class ObjetivosController {
  constructor(private readonly service: ObjetivosService) {}

  // Declarado antes de GET :id, senão o Nest casa "dashboard" como :id —
  // mesmo cuidado de ClientesController com vendedores-escopo/posicao.
  @ApiOperation({
    summary: 'Dashboard Comercial',
    description:
      'Objetivo (meta) vs realizado calculado ao vivo a partir das notas de saída, para o ' +
      'mês/ano informados. vendedorId omitido agrega todo o escopo hierárquico do usuário. ' +
      'Requer dashboard-comercial.visualizar.',
  })
  @RequirePermission('dashboard-comercial', 'visualizar')
  @Get('dashboard')
  dashboard(@Query() query: ObjetivoDashboardQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.dashboard(user.empresaAtivaId, user, query);
  }

  @ApiOperation({
    summary: 'Listar objetivos',
    description:
      'Metas mensais de vendedor (valor total, nº de clientes) com as linhas de meta por ' +
      'categoria embutidas. Filtra por ano, mês, vendedor e ativo. Requer objetivos.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('objetivos', 'visualizar')
  @Get()
  findAll(@Query() query: ObjetivoQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, user, query);
  }

  @ApiOperation({ summary: 'Detalhar objetivo', description: 'Requer objetivos.visualizar.' })
  @RequirePermission('objetivos', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Cadastrar objetivo',
    description:
      'Cria a meta mensal do vendedor junto com as linhas de meta por categoria. Falha se já ' +
      'existir objetivo para o mesmo vendedor/mês/ano. Requer objetivos.cadastrar.',
  })
  @RequirePermission('objetivos', 'cadastrar')
  @Post()
  create(@Body() dto: ObjetivoCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({
    summary: 'Copiar objetivos de um período para outro',
    description:
      'Replica os objetivos de um mês/ano para outro aplicando um percentual de reajuste ' +
      '(negativo reduz) sobre a meta e as linhas por categoria. Vendedor que já tem objetivo ' +
      'no destino é pulado, nunca sobrescrito. Requer objetivos.cadastrar.',
  })
  @RequirePermission('objetivos', 'cadastrar')
  @Post('copiar-periodo')
  copiarPeriodo(
    @Body() dto: ObjetivoCopiarPeriodoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.copiarPeriodo(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({
    summary: 'Editar objetivo',
    description:
      'Quando "categorias" é enviado, substitui o conjunto inteiro de linhas de meta por ' +
      'categoria. Requer objetivos.editar.',
  })
  @RequirePermission('objetivos', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: ObjetivoUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({ summary: 'Excluir objetivo (soft delete)', description: 'Requer objetivos.excluir.' })
  @RequirePermission('objetivos', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
