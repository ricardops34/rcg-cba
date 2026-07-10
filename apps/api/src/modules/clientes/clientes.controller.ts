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
import { ClientesService } from './clientes.service';
import { ClienteCreateDto, ClienteUpdateDto } from './dto/cliente.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('clientes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly service: ClientesService) {}

  @ApiOperation({
    summary: 'Listar clientes da carteira',
    description:
      'Vendedor vê a própria carteira; supervisor/gerente veem a de toda a equipe abaixo; ' +
      'admin vê todos. Busca por razão social, fantasia, CNPJ/CPF ou código ERP. Requer clientes.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('clientes', 'visualizar')
  @Get()
  findAll(@Query() query: PaginationQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, user, query);
  }

  @ApiOperation({
    summary: 'Posição consolidada do cliente',
    description:
      'Indicadores de compra, financeiro (títulos) e comodato do cliente — usada na tela de ' +
      'posição de clientes. Mesma regra de visão por hierarquia da listagem. Requer posicao-clientes.visualizar.',
  })
  @RequirePermission('posicao-clientes', 'visualizar')
  @Get(':id/posicao')
  posicao(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.posicao(user.empresaAtivaId, user, id);
  }

  @ApiOperation({ summary: 'Cadastrar cliente', description: 'Requer clientes.cadastrar.' })
  @RequirePermission('clientes', 'cadastrar')
  @Post()
  create(@Body() dto: ClienteCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({ summary: 'Editar cliente', description: 'Requer clientes.editar.' })
  @RequirePermission('clientes', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: ClienteUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({ summary: 'Excluir cliente (soft delete)', description: 'Requer clientes.excluir.' })
  @RequirePermission('clientes', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
