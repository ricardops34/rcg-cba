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
  DashboardGerencialQueryDto,
  DashboardGerencialVendedorQueryDto,
  ObjetivoCopiarPeriodoDto,
  ObjetivoCreateDto,
  ObjetivoDashboardMunicipiosQueryDto,
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
      'mês/ano informados. O realizado é a mesma base das Consultas: itens de nota ativa, ' +
      'não-comodato, tipo Normal e com financeiro, sem os de categoria marcada como não usada ' +
      'nas análises. vendedorId omitido agrega todo o escopo hierárquico do usuário. ' +
      'Requer dashboard-comercial.visualizar.',
  })
  @RequirePermission('dashboard-comercial', 'visualizar')
  @Get('dashboard')
  dashboard(@Query() query: ObjetivoDashboardQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.dashboard(user.empresaAtivaId, user, query);
  }

  @ApiOperation({
    summary: 'Municípios com venda no período (filtro do Dashboard Comercial)',
    description:
      'Municípios distintos dos clientes que compraram no mês/ano informados, dentro do escopo ' +
      'do usuário (e do vendedor, quando informado). Alimenta o filtro de município do ' +
      'Dashboard Comercial — só entram municípios com movimento, para o filtro não oferecer ' +
      'opção que deixaria a tela zerada. Requer dashboard-comercial.visualizar.',
  })
  @RequirePermission('dashboard-comercial', 'visualizar')
  @Get('dashboard/municipios')
  municipiosDashboard(
    @Query() query: ObjetivoDashboardMunicipiosQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.municipiosDashboard(user.empresaAtivaId, user, query);
  }

  @ApiOperation({
    summary: 'Dashboard Gerencial',
    description:
      'Acompanhamento do mês por vendedor: objetivo, realizado (líquido de devolução, na mesma ' +
      'base das Consultas — sem comodato, devolução, nota sem financeiro nem categoria ' +
      'recusada), ' +
      'positivação (meta e realizada) e o percentual de cada um, mais os indicadores de topo ' +
      '(base de clientes, clientes sem vendedor, ticket médio e devolução). vendedorId omitido ' +
      'agrega todo o escopo hierárquico do usuário. Requer dashboard-gerencial.visualizar.',
  })
  @RequirePermission('dashboard-gerencial', 'visualizar')
  @Get('dashboard-gerencial')
  dashboardGerencial(
    @Query() query: DashboardGerencialQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.dashboardGerencial(user.empresaAtivaId, user, query);
  }

  @ApiOperation({
    summary: 'Dashboard Gerencial — clientes sem vendedor ativo',
    description:
      'Detalhe do card: clientes ativos sem vendedor no cadastro ou apontando para ' +
      'vendedor inativo/excluído, com código, razão social, CNPJ/CPF e a última compra ' +
      '(a mais recente entre o cadastro e a última nota). Segue a visibilidade do card — ' +
      'em escopo restrito devolve lista vazia. Requer dashboard-gerencial.visualizar.',
  })
  @RequirePermission('dashboard-gerencial', 'visualizar')
  @Get('dashboard-gerencial/clientes-sem-vendedor')
  clientesSemVendedor(@CurrentUser() user: AuthenticatedUser) {
    return this.service.clientesSemVendedor(user.empresaAtivaId, user);
  }

  @ApiOperation({
    summary: 'Dashboard Gerencial — detalhe do vendedor por categoria',
    description:
      'Abre uma linha do Dashboard Gerencial: o mês daquele vendedor repartido por ' +
      'categoria de produto, com meta (linhas de categoria do objetivo) e realizado ' +
      '(líquido dos itens, pela categoria do produto). Vendedor fora do escopo do ' +
      'usuário responde 404. Requer dashboard-gerencial.visualizar.',
  })
  @RequirePermission('dashboard-gerencial', 'visualizar')
  @Get('dashboard-gerencial/vendedor/:vendedorId')
  dashboardGerencialVendedor(
    @Param('vendedorId') vendedorId: string,
    @Query() query: DashboardGerencialVendedorQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.dashboardGerencialVendedor(
      user.empresaAtivaId,
      user,
      vendedorId,
      query,
    );
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
