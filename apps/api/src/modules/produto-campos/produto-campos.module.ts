import { Module } from '@nestjs/common';
import { ProdutoCamposController } from './produto-campos.controller';
import { ProdutoCamposService } from './produto-campos.service';

/**
 * Campos complementares de produto. O service é exportado porque a ferramenta
 * de produtos da IA lê os valores por aqui — e com o mesmo recorte de
 * `visivelAgente`, em vez de uma segunda leitura que poderia esquecê-lo.
 */
@Module({
  controllers: [ProdutoCamposController],
  providers: [ProdutoCamposService],
  exports: [ProdutoCamposService],
})
export class ProdutoCamposModule {}
