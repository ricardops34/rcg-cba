import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { ProspeccaoController } from './prospeccao.controller';
import { ProspeccaoService } from './prospeccao.service';
import { GeocodificacaoModule } from '../geocodificacao/geocodificacao.module';

/**
 * Leads: a distribuição dos captados pela IA e a prospecção na base da
 * Receita. A **captação** pelo WhatsApp fica no módulo de WhatsApp, junto da
 * triagem que conversa — é lá que o dado nasce.
 */
@Module({
  // Coordenadas pelo Google ao salvar o endereço do lead.
  imports: [GeocodificacaoModule],
  // A prospecção vem antes: `leads/prospeccao/...` não pode cair numa rota
  // `leads/:id` (hoje só há PATCH :id, mas a ordem evita a surpresa).
  controllers: [ProspeccaoController, LeadsController],
  providers: [LeadsService, ProspeccaoService],
})
export class LeadsModule {}
