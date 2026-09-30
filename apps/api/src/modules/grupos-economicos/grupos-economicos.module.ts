import { Module } from '@nestjs/common';
import { PoliticaSenhaModule } from '../politica-senha/politica-senha.module';
import { GruposEconomicosController } from './grupos-economicos.controller';
import { GruposEconomicosService } from './grupos-economicos.service';

@Module({ imports: [PoliticaSenhaModule], controllers: [GruposEconomicosController], providers: [GruposEconomicosService] })
export class GruposEconomicosModule {}
