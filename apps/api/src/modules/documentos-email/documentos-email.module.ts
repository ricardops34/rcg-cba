import { Module } from '@nestjs/common';
import { ParametrosModule } from '../parametros/parametros.module';
import { NotasSaidaModule } from '../notas-saida/notas-saida.module';
import { TitulosReceberModule } from '../titulos-receber/titulos-receber.module';
import { DocumentosEmailController } from './documentos-email.controller';
import { DocumentosEmailService } from './documentos-email.service';

@Module({
  imports: [ParametrosModule, NotasSaidaModule, TitulosReceberModule],
  controllers: [DocumentosEmailController],
  providers: [DocumentosEmailService],
})
export class DocumentosEmailModule {}
