import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CLIENTE_CNAE_CREATE_EXAMPLE,
  CLIENTE_CNAE_EXAMPLE,
} from '@plataforma/contracts';
import { ClienteCnaesService } from './cliente-cnaes.service';
import { ClienteCnaeCreateDto } from './dto/cliente-cnae.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiBodyExample } from '../../common/decorators/api-body-example.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

/**
 * Coleção filha de Cliente: reusa a permissão `clientes` em vez de criar uma
 * rotina própria — quem edita o cliente gere seus CNAEs. O corte de carteira
 * vem do cliente pai (404 fora do escopo), não de uma regra nova.
 */
@ApiTags('clientes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clientes/:clienteId/cnaes')
export class ClienteCnaesController {
  constructor(private readonly service: ClienteCnaesService) {}

  @ApiOperation({
    summary: 'Listar CNAEs do cliente',
    description:
      'CNAEs vinculados ao cliente, com código e descrição da referência do IBGE. O principal ' +
      'vem primeiro. Requer clientes.visualizar.',
  })
  @ApiResponse({ status: 200, schema: { example: [CLIENTE_CNAE_EXAMPLE] } })
  @RequirePermission('clientes', 'visualizar')
  @Get()
  findAll(
    @Param('clienteId') clienteId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(user.empresaAtivaId, user, clienteId);
  }

  @ApiOperation({
    summary: 'Vincular CNAE ao cliente',
    description:
      'Vincula um CNAE da referência ao cliente. Marcar como principal rebaixa o principal ' +
      'anterior — só existe um por cliente. Requer clientes.editar.',
  })
  @ApiBodyExample(CLIENTE_CNAE_CREATE_EXAMPLE)
  @ApiResponse({ status: 201, schema: { example: CLIENTE_CNAE_EXAMPLE } })
  @ApiResponse({ status: 409, description: 'CNAE já vinculado ao cliente' })
  @RequirePermission('clientes', 'editar')
  @Post()
  create(
    @Param('clienteId') clienteId: string,
    @Body() dto: ClienteCnaeCreateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(user.empresaAtivaId, user, clienteId, dto);
  }

  @ApiOperation({
    summary: 'Definir CNAE principal do cliente',
    description:
      'Promove um CNAE já vinculado a principal e rebaixa o anterior. Requer clientes.editar.',
  })
  @ApiResponse({ status: 200, schema: { example: CLIENTE_CNAE_EXAMPLE } })
  @RequirePermission('clientes', 'editar')
  @Patch(':id/principal')
  definirPrincipal(
    @Param('clienteId') clienteId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.definirPrincipal(
      user.empresaAtivaId,
      user,
      clienteId,
      id,
    );
  }

  @ApiOperation({
    summary: 'Desvincular CNAE do cliente (soft delete)',
    description: 'Requer clientes.editar.',
  })
  @ApiResponse({ status: 200, schema: { example: { success: true } } })
  @RequirePermission('clientes', 'editar')
  @Delete(':id')
  remove(
    @Param('clienteId') clienteId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.remove(user.empresaAtivaId, user, clienteId, id);
  }
}
