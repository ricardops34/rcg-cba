import { Module } from '@nestjs/common';
import { ProdutosModule } from '../produtos/produtos.module';
import { EquipamentosComodatoController } from './equipamentos-comodato.controller';
import { EquipamentosComodatoService } from './equipamentos-comodato.service';

/**
 * Importa `ProdutosModule` pelo service dos relacionados: os produtos
 * aplicáveis são gravados pelo mesmo caminho do card "Relacionados".
 */
@Module({
  imports: [ProdutosModule],
  controllers: [EquipamentosComodatoController],
  providers: [EquipamentosComodatoService],
})
export class EquipamentosComodatoModule {}
