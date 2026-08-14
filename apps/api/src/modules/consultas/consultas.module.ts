import { Module } from '@nestjs/common';
import { ParametrosModule } from '../parametros/parametros.module';
import { ConsultasController } from './consultas.controller';
import { ConsultasService } from './consultas.service';

@Module({
  imports: [ParametrosModule],
  controllers: [ConsultasController],
  providers: [ConsultasService],
  // Exportado para o agente consumir como ferramenta.
  exports: [ConsultasService],
})
export class ConsultasModule {}
