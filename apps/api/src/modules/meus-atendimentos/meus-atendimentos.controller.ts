import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { MeusAtendimentosService } from './meus-atendimentos.service';
import { MeusAtendimentosQueryDto } from './dto/meus-atendimentos.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

/**
 * Linha do tempo do atendimento do vendedor logado.
 *
 * Rota de leitura e só: o que aparece aqui é gravado pelos módulos que fazem o
 * atendimento (WhatsApp, documentos, orçamentos, agenda) — esta tela não
 * inclui nem edita nada, e não existe rota para isso.
 */
@ApiTags('meus-atendimentos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('meus-atendimentos')
export class MeusAtendimentosController {
  constructor(private readonly service: MeusAtendimentosService) {}

  @ApiOperation({
    summary: 'O que o vendedor logado fez no período (1 a 7 dias)',
    description:
      'Linha do tempo montada sobre a rotina de Atividades: conversa de ' +
      'WhatsApp, 2ª via de documento, envio de títulos, orçamento e agenda. ' +
      'Sempre do próprio vendedor — não há como pedir o de outro. ' +
      'Requer meus-atendimentos.visualizar.',
  })
  @ApiQuery({ name: 'dias', required: false, example: 7 })
  @ApiQuery({ name: 'clienteId', required: false })
  @RequirePermission('meus-atendimentos', 'visualizar')
  @Get()
  resumo(
    @Query() query: MeusAtendimentosQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.resumo(user.empresaAtivaId, user, query);
  }
}
