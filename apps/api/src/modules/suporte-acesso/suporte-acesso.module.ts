import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SuporteAcessoService } from './suporte-acesso.service';
import { SuporteAcessoController } from './suporte-acesso.controller';
import { SuporteAcessoInterceptor } from './suporte-acesso.interceptor';

@Global()
@Module({
  controllers: [SuporteAcessoController],
  providers: [
    SuporteAcessoService,
    // Interceptor, não guard: precisa rodar depois do JwtAuthGuard (ver o
    // comentário em suporte-acesso.interceptor.ts).
    {
      provide: APP_INTERCEPTOR,
      useClass: SuporteAcessoInterceptor,
    },
  ],
  exports: [SuporteAcessoService],
})
export class SuporteAcessoModule {}
