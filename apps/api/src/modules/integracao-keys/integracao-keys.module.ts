import { Module } from '@nestjs/common';
import { IntegracaoKeysController } from './integracao-keys.controller';
import { IntegracaoKeysService } from './integracao-keys.service';

@Module({
  controllers: [IntegracaoKeysController],
  providers: [IntegracaoKeysService],
})
export class IntegracaoKeysModule {}
