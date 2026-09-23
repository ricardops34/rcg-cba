import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SuporteAcessoService } from './suporte-acesso.service';
import { SuporteAcessoController } from './suporte-acesso.controller';
import { SuporteAcessoGuard } from '../../common/guards/suporte-acesso.guard';

@Global()
@Module({
  controllers: [SuporteAcessoController],
  providers: [
    SuporteAcessoService,
    {
      provide: APP_GUARD,
      useClass: SuporteAcessoGuard,
    },
  ],
  exports: [SuporteAcessoService],
})
export class SuporteAcessoModule {}
