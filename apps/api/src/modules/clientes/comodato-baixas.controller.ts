import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { ComodatoBaixasService } from './comodato-baixas.service';
import { ComodatoBaixaCriarDto } from './dto/comodato-baixa.dto';

/**
 * Baixa de comodato a partir da Posição de Cliente (aba Equipamentos).
 * `posicao-cliente.visualizar` porque a decisão foi "quem tem acesso ao
 * cliente"; o recorte de carteira é do service.
 */
@ApiTags('clientes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clientes/:id/comodato-baixas')
export class ComodatoBaixasController {
  constructor(private readonly service: ComodatoBaixasService) {}

  @ApiOperation({
    summary: 'Baixar comodato do cliente',
    description:
      'Baixa o saldo atual de um equipamento no cliente: ele deixa de contar ' +
      'no saldo e no aviso de consumo. Entra no histórico de atendimento. ' +
      'Requer posicao-cliente.visualizar e o cliente na carteira.',
  })
  @RequirePermission('posicao-cliente', 'visualizar')
  @Post()
  baixar(
    @Param('id') id: string,
    @Body() dto: ComodatoBaixaCriarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.baixar(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Desfazer baixa de comodato',
    description:
      'O saldo volta a contar. A baixa fica registrada como desfeita, com quem ' +
      'desfez, e entra no histórico de atendimento. Requer ' +
      'posicao-cliente.visualizar e o cliente na carteira.',
  })
  @RequirePermission('posicao-cliente', 'visualizar')
  @Delete(':baixaId')
  desfazer(
    @Param('id') id: string,
    @Param('baixaId') baixaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.desfazer(user.empresaAtivaId, user, id, baixaId);
  }
}
