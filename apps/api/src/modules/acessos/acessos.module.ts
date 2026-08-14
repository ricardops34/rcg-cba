import { Global, Module } from '@nestjs/common';
import { AcessosController } from './acessos.controller';
import { AcessosService } from './acessos.service';
import { HorarioTrabalhoService } from './horario-trabalho.service';

/**
 * Global de propósito: `AcessosService` é usado pelo AuthService (registro dos
 * eventos de login) e `HorarioTrabalhoService` pelo `JwtAuthGuard`, que é
 * declarado em todos os módulos com rota autenticada. Sem @Global, cada um
 * deles teria de importar este módulo só para o guard conseguir resolver a
 * dependência.
 */
@Global()
@Module({
  controllers: [AcessosController],
  providers: [AcessosService, HorarioTrabalhoService],
  exports: [AcessosService, HorarioTrabalhoService],
})
export class AcessosModule {}
