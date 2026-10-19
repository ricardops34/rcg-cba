import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Ip,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { OrcamentoLinkService } from './orcamento-link.service';

class DecisaoLinkDto extends createZodDto(
  z.object({ observacao: z.string().trim().max(1000).optional() }),
) {}

@ApiTags('orcamentos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('orcamentos/:id/link')
export class OrcamentoLinkController {
  constructor(private readonly service: OrcamentoLinkService) {}

  @ApiOperation({
    summary: 'Link ativo do orçamento para o cliente (ou nulo)',
    description: 'Requer orcamentos.visualizar.',
  })
  @RequirePermission('orcamentos', 'visualizar')
  @Get()
  obter(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.obter(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Gerar o link público do orçamento',
    description:
      'Devolve o link ativo ou gera um novo, e passa o orçamento de rascunho para enviado. ' +
      'Recusa (409) orçamento com desconto sem autorização, sem itens, vencido ou já decidido. ' +
      'Requer orcamentos.editar.',
  })
  @RequirePermission('orcamentos', 'editar')
  @Post()
  gerar(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.gerar(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Revogar o link do orçamento',
    description: 'Requer orcamentos.editar.',
  })
  @RequirePermission('orcamentos', 'editar')
  @Delete()
  revogar(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.revogar(user.empresaAtivaId, user, id);
  }
}

/**
 * Rotas abertas, sem login: quem tem o token (não adivinhável) vê o orçamento e
 * responde uma vez. Sem JwtAuthGuard de propósito; o limite por IP é o do
 * ThrottlerGuard global, mais apertado aqui.
 */
@ApiTags('publico')
@Controller('publico/orcamentos/:token')
export class OrcamentoLinkPublicoController {
  constructor(private readonly service: OrcamentoLinkService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  ver(@Param('token') token: string) {
    return this.service.ver(token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('aprovar')
  aprovar(
    @Param('token') token: string,
    @Body() dto: DecisaoLinkDto,
    @Ip() ip: string,
    @Headers('user-agent') agente?: string,
  ) {
    return this.service.decidir(token, 'aprovado', dto.observacao, {
      ip: ip ?? null,
      agente: agente ?? null,
    });
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('recusar')
  recusar(
    @Param('token') token: string,
    @Body() dto: DecisaoLinkDto,
    @Ip() ip: string,
    @Headers('user-agent') agente?: string,
  ) {
    return this.service.decidir(token, 'recusado', dto.observacao, {
      ip: ip ?? null,
      agente: agente ?? null,
    });
  }
}
