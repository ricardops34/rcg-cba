import { Global, Module } from '@nestjs/common';
import { PlanoDisponibilidadeService } from './plano-disponibilidade.service';

/**
 * Global de propósito, como o `AcessosModule`: o `PermissionsGuard` é declarado
 * em todo módulo com rota autenticada, e cada um teria de importar este módulo
 * só para o guard resolver a dependência.
 */
@Global()
@Module({
  providers: [PlanoDisponibilidadeService],
  exports: [PlanoDisponibilidadeService],
})
export class PlanoDisponibilidadeModule {}
