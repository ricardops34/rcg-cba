import { Module } from '@nestjs/common';
import { ParametrosModule } from '../parametros/parametros.module';
import { TitulosReceberModule } from '../titulos-receber/titulos-receber.module';
import { SmsController, SmsWebhookController } from './sms.controller';
import { SmsService } from './sms.service';
import { SmsClienteService } from './sms-cliente.service';
import { SmsRelatorioService } from './sms-relatorio.service';
import { SmsWebhookService } from './sms-webhook.service';
import { SmsAvisoVencimentoService } from './sms-aviso-vencimento.service';

@Module({
  imports: [ParametrosModule, TitulosReceberModule],
  controllers: [SmsController, SmsWebhookController],
  providers: [
    SmsService,
    SmsClienteService,
    SmsRelatorioService,
    SmsWebhookService,
    SmsAvisoVencimentoService,
  ],
  // O cadastro de vendedores manda a senha provisória por SMS também.
  exports: [SmsService],
})
export class SmsModule {}
