import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { HorarioTrabalhoService } from '../../modules/acessos/horario-trabalho.service';
import { AcessosService } from '../../modules/acessos/acessos.service';
import { ForaDoExpedienteException } from '../horario/horario-trabalho';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { PERMITIR_TERMO_PENDENTE } from '../decorators/permitir-termo-pendente.decorator';
import { TermosService } from '../../modules/termos/termos.service';
import { TermoPendenteException } from '../../modules/termos/termo-pendente.exception';

/**
 * Autenticação por JWT e, na sequência, a trava de expediente: um access token
 * vale 15 minutos, então validar o horário só no login deixaria o usuário
 * trabalhando depois do fim do turno. Aqui a checagem acontece em toda
 * requisição autenticada — com cache de um minuto por usuário
 * (HorarioTrabalhoService), para não custar uma consulta por chamada.
 *
 * Quem passa do horário tem a sessão encerrada aqui e a renovação seguinte
 * recusada pelo AuthService.refresh (que aí revoga os tokens), então a tela
 * volta ao login com o motivo — ver api-client.ts.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly horarios: HorarioTrabalhoService,
    private readonly acessos: AcessosService,
    private readonly reflector: Reflector,
    private readonly termos: TermosService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const autenticado = (await super.canActivate(context)) as boolean;
    if (!autenticado) return false;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return false;

    const expediente = await this.horarios.verificar(user.id);
    if (!expediente.dentro) {
      await this.acessos.encerrarSessoesDoUsuario(user.id, 'fora_horario');
      await this.acessos.registrar({
        evento: 'acesso_fora_horario',
        email: user.email,
        usuarioId: user.id,
        empresaId: user.empresaAtivaId,
        detalhe: expediente.motivo,
        ip: request.ip,
        userAgent: request.headers?.['user-agent'],
      });
      throw new ForaDoExpedienteException(
        `Acesso permitido apenas em horário de trabalho. ${expediente.motivo}.`,
      );
    }

    const permitidoComTermoPendente = this.reflector.getAllAndOverride<boolean>(
      PERMITIR_TERMO_PENDENTE,
      [context.getHandler(), context.getClass()],
    );
    if (
      !permitidoComTermoPendente &&
      (await this.termos.temPendente(user.id))
    ) {
      throw new TermoPendenteException();
    }

    return true;
  }
}
