import { Module } from '@nestjs/common';
import { MeusAtendimentosController } from './meus-atendimentos.controller';
import { MeusAtendimentosService } from './meus-atendimentos.service';

@Module({
  controllers: [MeusAtendimentosController],
  providers: [MeusAtendimentosService],
  // O agente de IA usa o mesmo service da tela — ver AgenteToolsService.
  exports: [MeusAtendimentosService],
})
export class MeusAtendimentosModule {}
