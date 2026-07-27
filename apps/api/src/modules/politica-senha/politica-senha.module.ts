import { Module } from '@nestjs/common';
import { PoliticaSenhaController } from './politica-senha.controller';
import { PoliticaSenhaService } from './politica-senha.service';

@Module({
  controllers: [PoliticaSenhaController],
  providers: [PoliticaSenhaService],
  exports: [PoliticaSenhaService],
})
export class PoliticaSenhaModule {}
