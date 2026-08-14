import { Module } from '@nestjs/common';
import { TitulosReceberController } from './titulos-receber.controller';
import { TitulosReceberService } from './titulos-receber.service';

@Module({
  controllers: [TitulosReceberController],
  providers: [TitulosReceberService],
  // Exportado para o agente consumir como ferramenta.
  exports: [TitulosReceberService],
})
export class TitulosReceberModule {}
