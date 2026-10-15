import { Module } from '@nestjs/common';
import { ParametrosModule } from '../parametros/parametros.module';
import { RelatoriosController } from './relatorios.controller';
import { RelatoriosService } from './relatorios.service';

/** Módulo de Relatórios (ver `docs/planos/2026-10-13-modulo-relatorios.md`). */
@Module({
  imports: [ParametrosModule],
  controllers: [RelatoriosController],
  providers: [RelatoriosService],
})
export class RelatoriosModule {}
