import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappInternoController } from './whatsapp-interno.controller';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappSessaoService } from './whatsapp-sessao.service';
import { WhatsappConversasService } from './whatsapp-conversas.service';
import { WhatsappWorkerClient } from './whatsapp-worker.client';

@Module({
  controllers: [WhatsappController, WhatsappInternoController],
  providers: [
    WhatsappConfigService,
    WhatsappSessaoService,
    WhatsappConversasService,
    WhatsappWorkerClient,
  ],
  // Exportado para o feed de notificações somar as não lidas.
  exports: [WhatsappConfigService, WhatsappSessaoService, WhatsappConversasService],
})
export class WhatsappModule {}
