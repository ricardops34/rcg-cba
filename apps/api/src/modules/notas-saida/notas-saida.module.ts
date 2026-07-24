import { Module } from '@nestjs/common';
import { NotasSaidaController } from './notas-saida.controller';
import { NotasSaidaService } from './notas-saida.service';
import { ItensNotaSaidaController } from './itens-nota-saida.controller';
import { ItensNotaSaidaService } from './itens-nota-saida.service';

@Module({
  controllers: [NotasSaidaController, ItensNotaSaidaController],
  providers: [NotasSaidaService, ItensNotaSaidaService],
})
export class NotasSaidaModule {}
