import { Module } from '@nestjs/common';
import { ParametrosModule } from '../parametros/parametros.module';
import { PoliticaSenhaService } from './politica-senha.service';

/**
 * Sem controller: a política deixou de ter tela própria em 2026-08-26 e virou
 * parâmetro por empresa, editável em Administração > Parâmetros. O que sobrou
 * aqui é a leitura e a validação, que auth, usuários e vendedores consomem.
 */
@Module({
  imports: [ParametrosModule],
  providers: [PoliticaSenhaService],
  exports: [PoliticaSenhaService],
})
export class PoliticaSenhaModule {}
