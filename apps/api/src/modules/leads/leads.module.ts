import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

/**
 * Distribuição dos leads captados pela IA. A **captação** fica no módulo de
 * WhatsApp, junto da triagem que conversa — é lá que o dado nasce.
 */
@Module({
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
