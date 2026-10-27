import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { acompanhamentoQuerySchema } from '@plataforma/contracts';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { AcompanhamentoService } from './acompanhamento.service';

class AcompanhamentoQueryDto extends createZodDto(acompanhamentoQuerySchema) {}

/**
 * Acompanhamento da equipe (docs/planos/2026-10-27-acompanhamento-equipe.md).
 * Todas as rotas respeitam o escopo da hierarquia de quem consulta.
 */
@ApiTags('acompanhamento')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('acompanhamento')
export class AcompanhamentoController {
  constructor(private readonly service: AcompanhamentoService) {}

  @ApiOperation({
    summary:
      'Atendimento por WhatsApp: volume e tempo até a primeira resposta, por vendedor',
  })
  @RequirePermission('acompanhamento-equipe', 'visualizar')
  @Get('atendimento')
  atendimento(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: AcompanhamentoQueryDto,
  ) {
    return this.service.atendimento(user.empresaAtivaId, user, q.dias);
  }

  @ApiOperation({
    summary: 'Conversas de WhatsApp com contatos não vinculados a cliente',
  })
  @RequirePermission('acompanhamento-equipe', 'visualizar')
  @Get('nao-vinculados')
  naoVinculados(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: AcompanhamentoQueryDto,
  ) {
    return this.service.naoVinculados(user.empresaAtivaId, user, q.dias);
  }

  @ApiOperation({
    summary:
      'Cobertura de carteira: clientes que compraram ou foram contatados na janela',
  })
  @RequirePermission('acompanhamento-equipe', 'visualizar')
  @Get('carteira')
  carteira(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: AcompanhamentoQueryDto,
  ) {
    return this.service.carteira(user.empresaAtivaId, user, q.dias);
  }

  @ApiOperation({
    summary: 'Atualização cadastral dos clientes (janela fixa de 180 dias)',
  })
  @RequirePermission('acompanhamento-equipe', 'visualizar')
  @Get('cadastro')
  cadastro(@CurrentUser() user: AuthenticatedUser) {
    return this.service.cadastro(user.empresaAtivaId, user);
  }

  @ApiOperation({
    summary: 'Mix: produtos distintos por cliente, janela atual × anterior',
  })
  @RequirePermission('acompanhamento-equipe', 'visualizar')
  @Get('mix')
  mix(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: AcompanhamentoQueryDto,
  ) {
    return this.service.mix(user.empresaAtivaId, user, q.dias);
  }

  @ApiOperation({
    summary: 'Descontos praticados nos orçamentos e liberações de desconto',
  })
  @RequirePermission('acompanhamento-equipe', 'visualizar')
  @Get('descontos')
  descontos(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: AcompanhamentoQueryDto,
  ) {
    return this.service.descontos(user.empresaAtivaId, user, q.dias);
  }

  @ApiOperation({
    summary:
      'Orçamentos finalizados e não finalizados, conversão e tempo de decisão',
  })
  @RequirePermission('acompanhamento-equipe', 'visualizar')
  @Get('orcamentos')
  orcamentos(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: AcompanhamentoQueryDto,
  ) {
    return this.service.orcamentos(user.empresaAtivaId, user, q.dias);
  }

  @ApiOperation({
    summary:
      'Clientes com comodato sem compra e sem compra dos produtos aplicáveis',
  })
  @RequirePermission('acompanhamento-equipe', 'visualizar')
  @Get('comodato')
  comodato(@CurrentUser() user: AuthenticatedUser) {
    return this.service.comodato(user.empresaAtivaId, user);
  }
}
