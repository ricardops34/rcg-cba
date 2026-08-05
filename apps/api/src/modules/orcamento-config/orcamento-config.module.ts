import { Module } from '@nestjs/common';
import { OrcamentoConfigController } from './orcamento-config.controller';
import { OrcamentoConfigService } from './orcamento-config.service';

@Module({
  controllers: [OrcamentoConfigController],
  providers: [OrcamentoConfigService],
  exports: [OrcamentoConfigService],
})
export class OrcamentoConfigModule {}
