import { Module } from '@nestjs/common';
import { ContasBancariasModule } from '../contas-bancarias/contas-bancarias.module';
import { TitulosReceberController } from './titulos-receber.controller';
import { TitulosReceberService } from './titulos-receber.service';

@Module({
  // A 2ª via de boleto resolve o convênio de cobrança pelo cadastro de contas
  // bancárias (ver docs/planos/segunda-via-danfe-boleto.md).
  imports: [ContasBancariasModule],
  controllers: [TitulosReceberController],
  providers: [TitulosReceberService],
  // Exportado para o agente consumir como ferramenta.
  exports: [TitulosReceberService],
})
export class TitulosReceberModule {}
