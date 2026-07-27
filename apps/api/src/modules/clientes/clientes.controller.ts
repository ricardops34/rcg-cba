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
import { ClienteCreateDto, ClienteQueryDto, ClienteUpdateDto } from './dto/cliente.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
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
    summary: 'Listar clientes',
    description:
      'Carteira de clientes da empresa ativa, restrita ao escopo hierárquico do usuário logado ' +
      '(vendedor vê a própria carteira; supervisor/gerente veem o time; admin vê tudo). ' +
      'Busca por razão social, nome fantasia, código ERP ou CNPJ/CPF. Requer clientes.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('clientes', 'visualizar')
  @Get()
  findAll(@Query() query: ClienteQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, user, query);
  }

  // Declarado antes de GET :id, senão o Nest casa "vendedores-escopo" como :id.
  @ApiOperation({
    summary: 'Vendedores no escopo do usuário logado',
    description:
      'Opções de vendedor para o filtro/formulário de clientes, já restritas ao escopo ' +
      'hierárquico. restrito=false indica acesso total. Requer clientes.visualizar.',
  })
  @RequirePermission('clientes', 'visualizar')
  @Get('vendedores-escopo')
  vendedoresEscopo(@CurrentUser() user: AuthenticatedUser) {
    return this.service.vendedoresEscopo(user.empresaAtivaId, user);
  }

  @ApiOperation({ summary: 'Detalhar cliente', description: 'Requer clientes.visualizar.' })
  @RequirePermission('clientes', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Posição de cliente',
    description:
      'Tela agrupada: cliente + notas de saída + títulos a receber + mix de produtos comprados. ' +
      'Requer posicao-cliente.visualizar.',
  })
  @RequirePermission('posicao-cliente', 'visualizar')
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
