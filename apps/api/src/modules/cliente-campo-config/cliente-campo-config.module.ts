import { Module } from '@nestjs/common';
import { ClienteCampoConfigController } from './cliente-campo-config.controller';
import { ClienteCampoConfigService } from './cliente-campo-config.service';

@Module({
  controllers: [ClienteCampoConfigController],
  providers: [ClienteCampoConfigService],
  exports: [ClienteCampoConfigService],
})
export class ClienteCampoConfigModule {}
