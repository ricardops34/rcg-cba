import { Module } from '@nestjs/common';
import { NotasEntradaController } from './notas-entrada.controller';
import { NotasEntradaService } from './notas-entrada.service';

@Module({
  controllers: [NotasEntradaController],
  providers: [NotasEntradaService],
  exports: [NotasEntradaService],
})
export class NotasEntradaModule {}
