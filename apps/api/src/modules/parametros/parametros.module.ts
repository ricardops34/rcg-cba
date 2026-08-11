import { Module } from '@nestjs/common';
import { ParametrosController } from './parametros.controller';
import { ParametrosService } from './parametros.service';

// Exporta o service: outros módulos leem parâmetros (validade do orçamento,
// visibilidade de comissão, SMTP) através dele.
@Module({
  controllers: [ParametrosController],
  providers: [ParametrosService],
  exports: [ParametrosService],
})
export class ParametrosModule {}
