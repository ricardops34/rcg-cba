import { Module } from '@nestjs/common';
import { ParametrosModule } from '../parametros/parametros.module';
import { PoliticaSenhaController } from './politica-senha.controller';
import { PoliticaSenhaService } from './politica-senha.service';

/**
 * A política deixou de ter tela própria em 2026-08-26 e virou parâmetro por
 * empresa, editável em Administração > Parâmetros. O que sobrou aqui é a
 * leitura e a validação, que auth, usuários e vendedores consomem — e o
 * controller **só de leitura**, que as telas de senha usam para mostrar os
 * requisitos vigentes.
 */
@Module({
  imports: [ParametrosModule],
  controllers: [PoliticaSenhaController],
  providers: [PoliticaSenhaService],
  exports: [PoliticaSenhaService],
})
export class PoliticaSenhaModule {}
