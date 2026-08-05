import { Module } from '@nestjs/common';
import { IntegracaoCategoriasController } from './categorias/integracao-categorias.controller';
import { IntegracaoCategoriasService } from './categorias/integracao-categorias.service';
import { IntegracaoCondicoesPagamentoController } from './condicoes-pagamento/integracao-condicoes-pagamento.controller';
import { IntegracaoCondicoesPagamentoService } from './condicoes-pagamento/integracao-condicoes-pagamento.service';
import { IntegracaoArmazensController } from './armazens/integracao-armazens.controller';
import { IntegracaoArmazensService } from './armazens/integracao-armazens.service';
import { IntegracaoProdutosController } from './produtos/integracao-produtos.controller';
import { IntegracaoProdutosService } from './produtos/integracao-produtos.service';
import { IntegracaoVendedoresController } from './vendedores/integracao-vendedores.controller';
import { IntegracaoVendedoresService } from './vendedores/integracao-vendedores.service';
import { IntegracaoClientesController } from './clientes/integracao-clientes.controller';
import { IntegracaoClientesService } from './clientes/integracao-clientes.service';
import { IntegracaoTabelasPrecoController } from './tabelas-preco/integracao-tabelas-preco.controller';
import { IntegracaoTabelasPrecoService } from './tabelas-preco/integracao-tabelas-preco.service';
import { IntegracaoEstoqueController } from './estoque/integracao-estoque.controller';
import { IntegracaoEstoqueService } from './estoque/integracao-estoque.service';
import { IntegracaoObjetivosController } from './objetivos/integracao-objetivos.controller';
import { IntegracaoObjetivosService } from './objetivos/integracao-objetivos.service';
import { IntegracaoNotasSaidaController } from './notas-saida/integracao-notas-saida.controller';
import { IntegracaoNotasSaidaService } from './notas-saida/integracao-notas-saida.service';
import { IntegracaoTitulosReceberController } from './titulos-receber/integracao-titulos-receber.controller';
import { IntegracaoTitulosReceberService } from './titulos-receber/integracao-titulos-receber.service';
import { IntegracaoOrcamentosController } from './orcamentos/integracao-orcamentos.controller';
import { IntegracaoOrcamentosService } from './orcamentos/integracao-orcamentos.service';
import { ApiKeyGuard } from './guards/api-key.guard';

@Module({
  controllers: [
    IntegracaoCategoriasController,
    IntegracaoCondicoesPagamentoController,
    IntegracaoArmazensController,
    IntegracaoProdutosController,
    IntegracaoVendedoresController,
    IntegracaoClientesController,
    IntegracaoTabelasPrecoController,
    IntegracaoEstoqueController,
    IntegracaoObjetivosController,
    IntegracaoNotasSaidaController,
    IntegracaoTitulosReceberController,
    IntegracaoOrcamentosController,
  ],
  providers: [
    ApiKeyGuard,
    IntegracaoCategoriasService,
    IntegracaoCondicoesPagamentoService,
    IntegracaoArmazensService,
    IntegracaoProdutosService,
    IntegracaoVendedoresService,
    IntegracaoClientesService,
    IntegracaoTabelasPrecoService,
    IntegracaoEstoqueService,
    IntegracaoObjetivosService,
    IntegracaoNotasSaidaService,
    IntegracaoTitulosReceberService,
    IntegracaoOrcamentosService,
  ],
})
export class IntegracaoModule {}
