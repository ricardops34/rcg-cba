import { Module } from '@nestjs/common';
import { VendedorRegioesController } from './vendedor-regioes.controller';
import { VendedorRegioesService } from './vendedor-regioes.service';

/** Regiões de atuação dos vendedores e invasão de região. */
@Module({
  controllers: [VendedorRegioesController],
  providers: [VendedorRegioesService],
})
export class VendedorRegioesModule {}
