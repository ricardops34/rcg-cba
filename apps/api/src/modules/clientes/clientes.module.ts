import { Module } from '@nestjs/common';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';
import { ClienteCnaesController } from './cliente-cnaes.controller';
import { ClienteCnaesService } from './cliente-cnaes.service';
import { ClienteAlteracoesController } from './cliente-alteracoes.controller';
import { ClienteAlteracoesService } from './cliente-alteracoes.service';
import { EnriquecimentoService } from './enriquecimento.service';
import { ClientesReceitaLoteService } from './clientes-receita-lote.service';
import { ComodatoBaixasController } from './comodato-baixas.controller';
import { ComodatoBaixasService } from './comodato-baixas.service';
import { ClienteCampoConfigModule } from '../cliente-campo-config/cliente-campo-config.module';

@Module({
  imports: [ClienteCampoConfigModule],
  // ClientesController antes do aninhado: as rotas mais específicas de
  // /clientes (consulta-cnpj, posicao…) precisam ser avaliadas antes de :id.
  controllers: [
    ClientesController,
    ClienteCnaesController,
    ClienteAlteracoesController,
    ComodatoBaixasController,
  ],
  providers: [
    ClientesService,
    ClienteCnaesService,
    ClienteAlteracoesService,
    EnriquecimentoService,
    ComodatoBaixasService,
    ClientesReceitaLoteService,
  ],
  // ClienteAlteracoesService sai do módulo porque a integração do ERP também
  // enfileira alteração de cliente (ver IntegracaoClientesService).
  exports: [
    ClientesService,
    ClienteCnaesService,
    ClienteAlteracoesService,
    // O agente consulta CNPJ para atualizar o ramo do cliente (ver
    // agente-tools.service).
    EnriquecimentoService,
  ],
})
export class ClientesModule {}
