import { Module } from '@nestjs/common';
import { ParametrosModule } from '../parametros/parametros.module';
import { NotasSaidaController } from './notas-saida.controller';
import { NotasSaidaService } from './notas-saida.service';

@Module({
  imports: [ParametrosModule],
  controllers: [NotasSaidaController],
  providers: [NotasSaidaService],
  // Exportado para as ações de dentro da conversa de WhatsApp — que
  // delegam aqui em vez de consultar nota por conta própria.
  exports: [NotasSaidaService],
})
export class NotasSaidaModule {}
