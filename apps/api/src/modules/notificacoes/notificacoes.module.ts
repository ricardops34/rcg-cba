import { Module } from '@nestjs/common';
import { NotificacoesController } from './notificacoes.controller';
import { NotificacoesService } from './notificacoes.service';
import { NotificacoesVarreduraService } from './notificacoes-varredura.service';

@Module({
  // Sem imports: o feed lê só a tabela `notificacoes`. Quem produz o evento
  // chama `registrarNotificacao` dentro da própria transação — é o que evita
  // este módulo depender de todos os outros (e o inverso).
  controllers: [NotificacoesController],
  providers: [NotificacoesService, NotificacoesVarreduraService],
  // O agente lê a contagem do sino para a saudação de abertura (ver
  // `AgenteMeuDiaService`). Só o feed sai daqui: continua sem imports, e
  // quem produz notificação segue chamando `registrarNotificacao`.
  exports: [NotificacoesService],
})
export class NotificacoesModule {}
