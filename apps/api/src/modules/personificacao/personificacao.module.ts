import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PersonificacaoService } from './personificacao.service';
import { PersonificacaoController } from './personificacao.controller';
import { PersonificacaoInterceptor } from './personificacao.interceptor';

@Global()
@Module({
  controllers: [PersonificacaoController],
  providers: [
    PersonificacaoService,
    // Interceptor, não guard: precisa rodar depois do JwtAuthGuard (ver o
    // comentário em personificacao.interceptor.ts).
    {
      provide: APP_INTERCEPTOR,
      useClass: PersonificacaoInterceptor,
    },
  ],
  exports: [PersonificacaoService],
})
export class PersonificacaoModule {}
