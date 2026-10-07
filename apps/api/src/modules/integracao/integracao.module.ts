import { Module } from '@nestjs/common';
import { ParametrosModule } from '../parametros/parametros.module';
import { ClientesModule } from '../clientes/clientes.module';
import { IntegracaoCategoriasController } from './categorias/integracao-categorias.controller';
import { IntegracaoCategoriasService } from './categorias/integracao-categorias.service';
import { IntegracaoRegrasDescontoController } from './regras-desconto/integracao-regras-desconto.controller';
import { IntegracaoRegrasDescontoService } from './regras-desconto/integracao-regras-desconto.service';
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
import { IntegracaoClientesAlteracoesService } from './clientes/integracao-clientes-alteracoes.service';
import { IntegracaoEquipamentosComodatoController } from './equipamentos-comodato/integracao-equipamentos-comodato.controller';
import { IntegracaoEquipamentosComodatoService } from './equipamentos-comodato/integracao-equipamentos-comodato.service';
import { IntegracaoTabelasPrecoController } from './tabelas-preco/integracao-tabelas-preco.controller';
import { IntegracaoTabelasPrecoService } from './tabelas-preco/integracao-tabelas-preco.service';
import { IntegracaoEstoqueController } from './estoque/integracao-estoque.controller';
import { IntegracaoEstoqueService } from './estoque/integracao-estoque.service';
import { IntegracaoObjetivosController } from './objetivos/integracao-objetivos.controller';
import { IntegracaoObjetivosService } from './objetivos/integracao-objetivos.service';
import { IntegracaoNotasSaidaController } from './notas-saida/integracao-notas-saida.controller';
import { IntegracaoNotasSaidaService } from './notas-saida/integracao-notas-saida.service';
import { IntegracaoFornecedoresController } from './fornecedores/integracao-fornecedores.controller';
import { IntegracaoFornecedoresService } from './fornecedores/integracao-fornecedores.service';
import { IntegracaoNotasEntradaController } from './notas-entrada/integracao-notas-entrada.controller';
import { IntegracaoNotasEntradaService } from './notas-entrada/integracao-notas-entrada.service';
import { IntegracaoTitulosReceberController } from './titulos-receber/integracao-titulos-receber.controller';
import { IntegracaoTitulosReceberService } from './titulos-receber/integracao-titulos-receber.service';
import { IntegracaoOrcamentosController } from './orcamentos/integracao-orcamentos.controller';
import { IntegracaoOrcamentosService } from './orcamentos/integracao-orcamentos.service';
import { IntegracaoPedidosController } from './pedidos/integracao-pedidos.controller';
import { IntegracaoPedidosService } from './pedidos/integracao-pedidos.service';
import { IntegracaoComunicacaoController } from './comunicacao/integracao-comunicacao.controller';
import { IntegracaoComunicacaoService } from './comunicacao/integracao-comunicacao.service';
import { IntegracaoFileController } from './import/integracao-file.controller';
import { IntegracaoFileService } from './import/integracao-file.service';
import { IntegracaoCargasController } from './cargas/integracao-cargas.controller';
import { IntegracaoCargasAdminController } from './cargas/integracao-cargas-admin.controller';
import { IntegracaoCargasService } from './cargas/integracao-cargas.service';
import { CargasProcessador } from './cargas/cargas-processador.service';
import { EntidadesCarga } from './cargas/entidades-carga';
import { ApiKeyGuard } from './guards/api-key.guard';

@Module({
  // ClientesModule: o upsert de cliente do ERP passa pela mesma fila de
  // aprovação da tela (ClienteAlteracoesService).
  imports: [ParametrosModule, ClientesModule],
  controllers: [
    IntegracaoCategoriasController,
    IntegracaoRegrasDescontoController,
    IntegracaoCondicoesPagamentoController,
    IntegracaoArmazensController,
    IntegracaoProdutosController,
    IntegracaoVendedoresController,
    IntegracaoClientesController,
    IntegracaoEquipamentosComodatoController,
    IntegracaoTabelasPrecoController,
    IntegracaoEstoqueController,
    IntegracaoObjetivosController,
    IntegracaoNotasSaidaController,
    IntegracaoFornecedoresController,
    IntegracaoNotasEntradaController,
    IntegracaoTitulosReceberController,
    IntegracaoOrcamentosController,
    IntegracaoPedidosController,
    IntegracaoComunicacaoController,
    IntegracaoFileController,
    IntegracaoCargasController,
    IntegracaoCargasAdminController,
  ],
  providers: [
    ApiKeyGuard,
    IntegracaoComunicacaoService,
    IntegracaoCategoriasService,
    IntegracaoRegrasDescontoService,
    IntegracaoCondicoesPagamentoService,
    IntegracaoArmazensService,
    IntegracaoProdutosService,
    IntegracaoVendedoresService,
    IntegracaoClientesService,
    IntegracaoClientesAlteracoesService,
    IntegracaoEquipamentosComodatoService,
    IntegracaoTabelasPrecoService,
    IntegracaoEstoqueService,
    IntegracaoObjetivosService,
    IntegracaoNotasSaidaService,
    IntegracaoFornecedoresService,
    IntegracaoNotasEntradaService,
    IntegracaoTitulosReceberService,
    IntegracaoOrcamentosService,
    IntegracaoPedidosService,
    IntegracaoFileService,
    IntegracaoCargasService,
    EntidadesCarga,
    CargasProcessador,
  ],
})
export class IntegracaoModule {}

