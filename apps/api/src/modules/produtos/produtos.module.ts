import { Module } from '@nestjs/common';
import { ProdutosController } from './produtos.controller';
import { ProdutosService } from './produtos.service';
import { ProdutoRelacionadosService } from './produto-relacionados.service';
import { ProdutoFichasService } from './produto-fichas.service';
import { ProdutoFotosImportacaoController } from './produto-fotos-importacao.controller';
import { ProdutoFotosImportacaoService } from './produto-fotos-importacao.service';

@Module({
  controllers: [ProdutosController, ProdutoFotosImportacaoController],
  providers: [
    ProdutosService,
    ProdutoRelacionadosService,
    ProdutoFichasService,
    ProdutoFotosImportacaoService,
  ],
  // O service dos relacionados é exportado porque a ferramenta de produtos
  // da IA vai ler similares e aplicação pelo mesmo caminho.
  exports: [ProdutosService, ProdutoRelacionadosService, ProdutoFichasService],
})
export class ProdutosModule {}
