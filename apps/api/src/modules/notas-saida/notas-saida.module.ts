import { Module } from '@nestjs/common';
import { NotasSaidaController } from './notas-saida.controller';
import { NotasSaidaService } from './notas-saida.service';

@Module({
  controllers: [NotasSaidaController],
  providers: [NotasSaidaService],
})
export class NotasSaidaModule {}
