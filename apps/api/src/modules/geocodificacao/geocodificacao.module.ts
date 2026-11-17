import { Module } from '@nestjs/common';
import { ParametrosModule } from '../parametros/parametros.module';
import { ClienteAlteracoesService } from '../clientes/cliente-alteracoes.service';
import { GeocodificacaoController } from './geocodificacao.controller';
import { GeocodificacaoService } from './geocodificacao.service';
import { GeocodificacaoLoteService } from './geocodificacao-lote.service';

/**
 * Coordenadas do cliente pelo Google (docs/planos/geocodificacao-clientes.md).
 *
 * `ClienteAlteracoesService` é provido aqui, e não importado do
 * ClientesModule, porque o ClientesModule importa este (busca ao salvar o
 * cliente) — importar de volta seria ciclo. Ele só depende do Prisma.
 */
@Module({
  imports: [ParametrosModule],
  controllers: [GeocodificacaoController],
  providers: [
    GeocodificacaoService,
    GeocodificacaoLoteService,
    ClienteAlteracoesService,
  ],
  exports: [GeocodificacaoService],
})
export class GeocodificacaoModule {}
