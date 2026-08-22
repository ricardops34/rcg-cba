import { Module } from '@nestjs/common';
import { InicioController, ComunicadosController } from './inicio.controller';
import { ComunicadosService } from './comunicados.service';
import { AniversariantesService } from './aniversariantes.service';

@Module({
  controllers: [InicioController, ComunicadosController],
  providers: [ComunicadosService, AniversariantesService],
})
export class InicioModule {}
