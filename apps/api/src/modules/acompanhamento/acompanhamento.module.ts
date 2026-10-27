import { Module } from '@nestjs/common';
import { AcompanhamentoController } from './acompanhamento.controller';
import { AcompanhamentoService } from './acompanhamento.service';

/** Acompanhamento da equipe (docs/planos/2026-10-27-acompanhamento-equipe.md). */
@Module({
  controllers: [AcompanhamentoController],
  providers: [AcompanhamentoService],
})
export class AcompanhamentoModule {}
