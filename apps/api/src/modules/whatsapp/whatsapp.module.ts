import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappInternoController } from './whatsapp-interno.controller';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappTriagemService } from './triagem/whatsapp-triagem.service';
import { ProvedorIaModule } from '../agente/provedor-ia.module';
import { WhatsappSessaoService } from './whatsapp-sessao.service';
import { WhatsappConversasService } from './whatsapp-conversas.service';
import { WhatsappAgendaService } from './whatsapp-agenda.service';
import { WhatsappAcoesService } from './whatsapp-acoes.service';
import { WhatsappAgendamentoService } from './whatsapp-agendamento.service';
import { WhatsappWorkerClient } from './whatsapp-worker.client';
import { WhatsappEvolutionController } from './whatsapp-evolution.controller';
import { WhatsappProviderService } from './providers/whatsapp-provider.service';
import { ZapoProvider } from './providers/zapo.provider';
import { EvolutionGoProvider } from './providers/evolution-go.provider';
import { EvolutionGoClient } from './providers/evolution-go.client';
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
    // A triagem usa o provedor de IA e a credencial da empresa — a mesma
    // camada do agente interno, que é onde de fato não há diferença entre os
    // dois. O prompt e as ferramentas são de cada um.
    ProvedorIaModule,
  ],
  controllers: [
    WhatsappController,
    WhatsappInternoController,
    // Callback da Evolution GO. Fica separado do interno do worker porque a
    // autenticação é outra: aqui o segredo é por instância, não um token único
    // compartilhado por todo o serviço.
    WhatsappEvolutionController,
  ],
  providers: [
    WhatsappConfigService,
    WhatsappSessaoService,
    WhatsappConversasService,
    WhatsappAgendaService,
    WhatsappAcoesService,
    WhatsappAgendamentoService,
    WhatsappTriagemService,
    // Transporte: o roteador e as duas implementações. Nada fora de
    // `providers/` conhece worker ou gateway — ver `whatsapp-provider.ts`.
    WhatsappProviderService,
    ZapoProvider,
    EvolutionGoProvider,
    WhatsappWorkerClient,
    EvolutionGoClient,
  ],
  // Exportado para o feed de notificações somar as não lidas.
  exports: [
    WhatsappConfigService,
    WhatsappSessaoService,
    WhatsappConversasService,
    // Para o catálogo do agente de IA, que fala pela conversa do próprio vendedor.
    WhatsappAcoesService,
    WhatsappAgendamentoService,
  ],
})
export class WhatsappModule {}
