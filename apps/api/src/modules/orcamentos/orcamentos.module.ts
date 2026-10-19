import { Module } from '@nestjs/common';
import { ParametrosModule } from '../parametros/parametros.module';
import { OrcamentosController } from './orcamentos.controller';
import { OrcamentosService } from './orcamentos.service';
import {
  OrcamentoLinkController,
  OrcamentoLinkPublicoController,
} from './orcamento-link.controller';
import { OrcamentoLinkService } from './orcamento-link.service';

@Module({
  imports: [ParametrosModule],
  controllers: [
    OrcamentosController,
    OrcamentoLinkController,
    OrcamentoLinkPublicoController,
  ],
  providers: [OrcamentosService, OrcamentoLinkService],
  exports: [OrcamentosService],
})
export class OrcamentosModule {}
