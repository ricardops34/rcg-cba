import { Module } from '@nestjs/common';
import { PlataformaArmazenamentoController } from './plataforma-armazenamento.controller';
import { MidiaOrfaService } from './midia-orfa.service';

/**
 * Armazenamento de arquivos (ver
 * `docs/planos/2026-10-13-armazenamento-arquivos-minio.md`).
 */
@Module({
  controllers: [PlataformaArmazenamentoController],
  providers: [MidiaOrfaService],
})
export class ArmazenamentoModule {}
