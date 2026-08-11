import { Module } from '@nestjs/common';
import { ParametrosModule } from '../parametros/parametros.module';
import { ConsultasController } from './consultas.controller';
import { ConsultasService } from './consultas.service';

@Module({
  imports: [ParametrosModule],
  controllers: [ConsultasController],
  providers: [ConsultasService],
})
export class ConsultasModule {}
