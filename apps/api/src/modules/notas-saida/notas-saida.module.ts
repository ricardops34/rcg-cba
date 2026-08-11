import { Module } from '@nestjs/common';
import { ParametrosModule } from '../parametros/parametros.module';
import { NotasSaidaController } from './notas-saida.controller';
import { NotasSaidaService } from './notas-saida.service';

@Module({
  imports: [ParametrosModule],
  controllers: [NotasSaidaController],
  providers: [NotasSaidaService],
})
export class NotasSaidaModule {}
