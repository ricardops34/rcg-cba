import { Module } from '@nestjs/common';
import { ParametrosModule } from '../parametros/parametros.module';
import { ReceitaBaseController } from './receita-base.controller';
import { ReceitaBaseService } from './receita-base.service';

/**
 * Base própria da Receita e os parâmetros da coleta de leads. Exporta o
 * serviço para a prospecção (LeadsModule) ler fonte e limites.
 */
@Module({
  imports: [ParametrosModule],
  controllers: [ReceitaBaseController],
  providers: [ReceitaBaseService],
  exports: [ReceitaBaseService],
})
export class ReceitaBaseModule {}
