import { Module } from '@nestjs/common';
import { OrcamentoConfigController } from './orcamento-config.controller';
import { OrcamentoConfigService } from './orcamento-config.service';
import { ParametrosModule } from '../parametros/parametros.module';

@Module({
  imports: [ParametrosModule],
  controllers: [OrcamentoConfigController],
  providers: [OrcamentoConfigService],
  exports: [OrcamentoConfigService],
})
export class OrcamentoConfigModule {}
