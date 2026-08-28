import { Module } from '@nestjs/common';
import { ProdutosController } from './produtos.controller';
import { ProdutosService } from './produtos.service';
import { ProdutoFotosImportacaoController } from './produto-fotos-importacao.controller';
import { ProdutoFotosImportacaoService } from './produto-fotos-importacao.service';

@Module({
  controllers: [ProdutosController, ProdutoFotosImportacaoController],
  providers: [ProdutosService, ProdutoFotosImportacaoService],
  exports: [ProdutosService],
})
export class ProdutosModule {}
