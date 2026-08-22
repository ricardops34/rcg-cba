import { Module } from '@nestjs/common';
import { ContasBancariasController } from './contas-bancarias.controller';
import { ContasBancariasService } from './contas-bancarias.service';

@Module({
  controllers: [ContasBancariasController],
  providers: [ContasBancariasService],
  // Exportado porque a 2ª via de boleto resolve a conta do título pelo mesmo
  // service (ver TitulosReceberService.gerarBoleto).
  exports: [ContasBancariasService],
})
export class ContasBancariasModule {}
