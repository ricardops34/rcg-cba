import { Module } from '@nestjs/common';
import { CategoriasController } from './categorias/categorias.controller';
import { CategoriasService } from './categorias/categorias.service';
import { CondicoesPagamentoController } from './condicoes-pagamento/condicoes-pagamento.controller';
import { CondicoesPagamentoService } from './condicoes-pagamento/condicoes-pagamento.service';
import { ArmazensController } from './armazens/armazens.controller';
import { ArmazensService } from './armazens/armazens.service';
import { EstadosController } from './estados/estados.controller';
import { EstadosService } from './estados/estados.service';
import { MunicipiosController } from './municipios/municipios.controller';
import { MunicipiosService } from './municipios/municipios.service';
import { CepsController } from './ceps/ceps.controller';
import { CepsService } from './ceps/ceps.service';
import { PaisesController } from './paises/paises.controller';
import { PaisesService } from './paises/paises.service';
import { CnaesController } from './cnaes/cnaes.controller';
import { CnaesService } from './cnaes/cnaes.service';

// Família de CRUDs auxiliares (módulo "Cadastros" do menu). Cada entidade tem
// sua pasta controller/service/dto no padrão de produtos/vendedores; o módulo
// Nest é único porque compartilham o mesmo domínio e nenhum expõe service para
// fora daqui.
@Module({
  controllers: [
    CategoriasController,
    CondicoesPagamentoController,
    ArmazensController,
    EstadosController,
    MunicipiosController,
    CepsController,
    PaisesController,
    CnaesController,
  ],
  providers: [
    CategoriasService,
    CondicoesPagamentoService,
    ArmazensService,
    EstadosService,
    MunicipiosService,
    CepsService,
    PaisesService,
    CnaesService,
  ],
})
export class CadastrosModule {}
