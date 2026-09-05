import { Module } from '@nestjs/common';
import { ErrosController } from './erros.controller';
import { PlataformaErrosController } from './plataforma-erros.controller';
import { ErrosLogService } from './erros-log.service';
import { ErrosVarreduraService } from './erros-varredura.service';

/**
 * Log de erros (ver `docs/planos/log-de-erros.md`).
 *
 * Sem imports: o serviço só fala com o Prisma. Quem produz o erro não chama
 * este módulo — o `AllExceptionsFilter` é `@Catch()` global e captura tudo num
 * ponto só, e o navegador reporta por HTTP. É o que evita este módulo depender
 * de todos os outros.
 *
 * `ErrosLogService` é exportado porque `main.ts` o resolve do container para
 * injetá-lo no filtro global.
 */
@Module({
  controllers: [ErrosController, PlataformaErrosController],
  providers: [ErrosLogService, ErrosVarreduraService],
  exports: [ErrosLogService],
})
export class ErrosModule {}
