import { Module } from '@nestjs/common';
import { AcessosModule } from '../acessos/acessos.module';
import { EmailConfigModule } from '../email/email-config.module';
import { ParametrosModule } from '../parametros/parametros.module';
import { PoliticaSenhaModule } from '../politica-senha/politica-senha.module';
import { RecuperacaoSenhaController } from './recuperacao-senha.controller';
import { RecuperacaoSenhaService } from './recuperacao-senha.service';

/** "Esqueci minha senha" (ver `docs/planos/2026-10-13-esqueci-minha-senha.md`). */
@Module({
  imports: [
    AcessosModule,
    EmailConfigModule,
    ParametrosModule,
    PoliticaSenhaModule,
  ],
  controllers: [RecuperacaoSenhaController],
  providers: [RecuperacaoSenhaService],
})
export class RecuperacaoSenhaModule {}
