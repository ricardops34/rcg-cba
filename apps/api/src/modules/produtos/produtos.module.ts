import { Module } from '@nestjs/common';
import { ProdutosController } from './produtos.controller';
import { ProdutosService } from './produtos.service';
import { ProdutoRelacionadosService } from './produto-relacionados.service';
import { ProdutoFichasService } from './produto-fichas.service';
import { ProdutoParaAgenteService } from './produto-para-agente.service';
import { FichaEmbeddingService } from './ficha-embedding.service';
import { FichaImportacaoController } from './ficha-importacao.controller';
import { FichaImportacaoService } from './ficha-importacao.service';
import { ProvedorIaModule } from '../agente/provedor-ia.module';
import { ProdutoFotosImportacaoController } from './produto-fotos-importacao.controller';
import { ProdutoFotosImportacaoService } from './produto-fotos-importacao.service';

/**
 * A importação de fichas importa `ProvedorIaModule`, e não o `AgenteModule`:
 * é a camada de IA sem o agente, criada justamente para quem precisa da
 * credencial e do cliente do provedor sem arrastar prompt e ferramentas junto.
 * Importar o agente aqui fecharia um ciclo — ele já importa este módulo.
 */
@Module({
  imports: [ProvedorIaModule],
  controllers: [
    ProdutosController,
    ProdutoFotosImportacaoController,
    FichaImportacaoController,
  ],
  providers: [
    ProdutosService,
    ProdutoRelacionadosService,
    ProdutoFichasService,
    ProdutoParaAgenteService,
    FichaEmbeddingService,
    FichaImportacaoService,
    ProdutoFotosImportacaoService,
  ],
  // O service dos relacionados é exportado porque a ferramenta de produtos
  // da IA vai ler similares e aplicação pelo mesmo caminho.
  exports: [
    ProdutosService,
    ProdutoRelacionadosService,
    ProdutoFichasService,
    ProdutoParaAgenteService,
    FichaEmbeddingService,
  ],
})
export class ProdutosModule {}
