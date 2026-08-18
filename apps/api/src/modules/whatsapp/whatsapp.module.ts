import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappInternoController } from './whatsapp-interno.controller';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappSessaoService } from './whatsapp-sessao.service';
import { WhatsappConversasService } from './whatsapp-conversas.service';
import { WhatsappAgendaService } from './whatsapp-agenda.service';
import { WhatsappAcoesService } from './whatsapp-acoes.service';
import { WhatsappWorkerClient } from './whatsapp-worker.client';
import { TitulosReceberModule } from '../titulos-receber/titulos-receber.module';
import { NotasSaidaModule } from '../notas-saida/notas-saida.module';
import { AtividadesModule } from '../atividades/atividades.module';
import { OrcamentosModule } from '../orcamentos/orcamentos.module';

@Module({
  // As ações de dentro da conversa delegam aos services que as telas já usam
  // — nada de consulta própria, para o escopo de carteira e o RLS não serem
  // reimplementados aqui.
  imports: [
    TitulosReceberModule,
    NotasSaidaModule,
    AtividadesModule,
    OrcamentosModule,
  ],
  controllers: [WhatsappController, WhatsappInternoController],
  providers: [
    WhatsappConfigService,
    WhatsappSessaoService,
    WhatsappConversasService,
    WhatsappAgendaService,
    WhatsappAcoesService,
    WhatsappWorkerClient,
  ],
  // Exportado para o feed de notificações somar as não lidas.
  exports: [WhatsappConfigService, WhatsappSessaoService, WhatsappConversasService],
})
export class WhatsappModule {}
