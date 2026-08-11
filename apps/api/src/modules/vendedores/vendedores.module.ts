import { Module } from '@nestjs/common';
import { ParametrosModule } from '../parametros/parametros.module';
import { VendedoresController } from './vendedores.controller';
import { VendedoresService } from './vendedores.service';
import { PoliticaSenhaModule } from '../politica-senha/politica-senha.module';

@Module({
  imports: [ParametrosModule, PoliticaSenhaModule],
  controllers: [VendedoresController],
  providers: [VendedoresService],
  exports: [VendedoresService],
})
export class VendedoresModule {}
