import { Module } from '@nestjs/common';
import { EmailConfigModule } from '../email/email-config.module';
import { ParametrosModule } from '../parametros/parametros.module';
import { NotasSaidaModule } from '../notas-saida/notas-saida.module';
import { TitulosReceberModule } from '../titulos-receber/titulos-receber.module';
import { DocumentosEmailController } from './documentos-email.controller';
import { DocumentosEmailService } from './documentos-email.service';

@Module({
  imports: [
    ParametrosModule,
    NotasSaidaModule,
    TitulosReceberModule,
    EmailConfigModule,
  ],
  controllers: [DocumentosEmailController],
  providers: [DocumentosEmailService],
})
export class DocumentosEmailModule {}
