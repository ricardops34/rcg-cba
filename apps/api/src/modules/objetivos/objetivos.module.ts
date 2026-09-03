import { Module } from '@nestjs/common';
import { ObjetivosController } from './objetivos.controller';
import { ObjetivosService } from './objetivos.service';
import { ParametrosModule } from '../parametros/parametros.module';

@Module({
  imports: [ParametrosModule],
  controllers: [ObjetivosController],
  providers: [ObjetivosService],
  exports: [ObjetivosService],
})
export class ObjetivosModule {}
