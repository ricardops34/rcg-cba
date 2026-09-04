import { Module } from '@nestjs/common';
import { AgenteController } from './agente.controller';
import { AgenteChatService } from './agente-chat.service';
import { AgenteToolsService } from './agente-tools.service';
import { AgenteReferenciasService } from './agente-referencias.service';
import { AgenteFerramentasService } from './agente-ferramentas.service';
import { ProvedorIaModule } from './provedor-ia.module';
import { ConsultasModule } from '../consultas/consultas.module';
import { ClientesModule } from '../clientes/clientes.module';
import { ProdutosModule } from '../produtos/produtos.module';
import { OrcamentosModule } from '../orcamentos/orcamentos.module';
import { TitulosReceberModule } from '../titulos-receber/titulos-receber.module';
import { SugestaoCompraModule } from '../sugestao-compra/sugestao-compra.module';
import { ObjetivosModule } from '../objetivos/objetivos.module';
import { AtividadesModule } from '../atividades/atividades.module';
import { OportunidadesModule } from '../oportunidades/oportunidades.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { VendedoresModule } from '../vendedores/vendedores.module';
import { MeusAtendimentosModule } from '../meus-atendimentos/meus-atendimentos.module';

/**
 * O agente não reimplementa nada: importa os módulos das telas e chama os
 * mesmos services, com o mesmo usuário autenticado. É o que faz o escopo de
 * carteira e a RLS valerem para ele de graça.
 */
@Module({
  imports: [
    ConsultasModule,
    ClientesModule,
    ProdutosModule,
    OrcamentosModule,
    TitulosReceberModule,
    SugestaoCompraModule,
    ObjetivosModule,
    AtividadesModule,
    OportunidadesModule,
    WhatsappModule,
    VendedoresModule,
    MeusAtendimentosModule,
    ProvedorIaModule,
  ],
  controllers: [AgenteController],
  providers: [
    AgenteChatService,
    AgenteToolsService,
    AgenteReferenciasService,
    AgenteFerramentasService,
  ],
})
export class AgenteModule {}
