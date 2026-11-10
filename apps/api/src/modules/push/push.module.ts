import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { PushEnvioService } from './push-envio.service';

/**
 * Aviso no celular (Web Push). Lê a fila de `notificacoes` — quem produz
 * notificação continua chamando só `registrarNotificacao`, sem saber deste
 * módulo. `HorarioTrabalhoService` vem do AcessosModule, que é global.
 */
@Module({
  controllers: [PushController],
  providers: [PushService, PushEnvioService],
})
export class PushModule {}
