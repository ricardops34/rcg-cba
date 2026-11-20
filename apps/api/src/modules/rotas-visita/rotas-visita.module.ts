import { Module } from '@nestjs/common';
import { GeocodificacaoModule } from '../geocodificacao/geocodificacao.module';
import { RotasVisitaController } from './rotas-visita.controller';
import { RotasVisitaService } from './rotas-visita.service';

/** Rotas de visita: a chave e o liga/desliga do Google vêm da Geolocalização. */
@Module({
  imports: [GeocodificacaoModule],
  controllers: [RotasVisitaController],
  providers: [RotasVisitaService],
})
export class RotasVisitaModule {}
