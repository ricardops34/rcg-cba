import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificacoesService } from './notificacoes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('notificacoes')
@ApiBearerAuth()
// Sem PermissionsGuard de propósito: a notificação é endereçada a um usuário
// na origem, onde o escopo era conhecido — não é uma tela com rotina própria.
// Cada rota já se restringe ao usuário logado.
@UseGuards(JwtAuthGuard)
@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly notificacoes: NotificacoesService) {}

  @ApiOperation({
    summary: 'Notificações não lidas do usuário logado',
    description:
      'Alimenta o sino: total para o badge e as mais recentes para a lista.',
  })
  @Get()
  feed(@CurrentUser() user: AuthenticatedUser) {
    return this.notificacoes.feed(user.empresaAtivaId, user);
  }

  @ApiOperation({ summary: 'Marcar uma notificação como lida' })
  @Post(':id/lida')
  marcarLida(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notificacoes.marcarLida(user.empresaAtivaId, user, id);
  }

  @ApiOperation({ summary: 'Marcar todas as notificações como lidas' })
  @Post('lidas')
  marcarTodasLidas(@CurrentUser() user: AuthenticatedUser) {
    return this.notificacoes.marcarTodasLidas(user.empresaAtivaId, user);
  }
}
