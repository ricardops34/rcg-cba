import { Module } from '@nestjs/common';
import { SugestaoCompraController } from './sugestao-compra.controller';
import { SugestaoCompraService } from './sugestao-compra.service';
import { ParametrosModule } from '../parametros/parametros.module';

@Module({
  imports: [ParametrosModule],
  controllers: [SugestaoCompraController],
  providers: [SugestaoCompraService],
  // Exportado para o agente consumir como ferramenta (Bloco D).
  exports: [SugestaoCompraService],
})
export class SugestaoCompraModule {}
