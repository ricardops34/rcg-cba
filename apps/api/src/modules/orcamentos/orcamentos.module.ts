import { Module } from '@nestjs/common';
import { ParametrosModule } from '../parametros/parametros.module';
import { OrcamentosController } from './orcamentos.controller';
import { OrcamentosService } from './orcamentos.service';

@Module({
  imports: [ParametrosModule],
  controllers: [OrcamentosController],
  providers: [OrcamentosService],
  exports: [OrcamentosService],
})
export class OrcamentosModule {}
