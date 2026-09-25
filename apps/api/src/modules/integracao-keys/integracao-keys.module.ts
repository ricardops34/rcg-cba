import { Module } from '@nestjs/common';
import { IntegracaoKeysController } from './integracao-keys.controller';
import { IntegracaoKeysService } from './integracao-keys.service';
import { IntegracaoEndpointsService } from './integracao-endpoints.service';

@Module({
  controllers: [IntegracaoKeysController],
  providers: [IntegracaoKeysService, IntegracaoEndpointsService],
  exports: [IntegracaoEndpointsService],
})
export class IntegracaoKeysModule {}
