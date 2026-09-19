import { Module } from '@nestjs/common';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

/**
 * Sem imports: o gerador e a limpeza falam direto com o Prisma, dentro de
 * `withTenant`.
 *
 * É a exceção consciente à regra do resto do sistema (delegar ao service da
 * tela). Aqui não há regra de negócio a preservar — o objetivo é justamente
 * produzir um estado bruto, com datas no passado e numeração de nota que
 * nenhum service aceitaria criar. O que protege o vizinho não é o service, é
 * a RLS do `withTenant`.
 */
@Module({
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
