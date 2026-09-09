import { Global, Module } from '@nestjs/common';
import { TermosController } from './termos.controller';
import { TermosService } from './termos.service';

@Global()
@Module({
  controllers: [TermosController],
  providers: [TermosService],
  exports: [TermosService],
})
export class TermosModule {}
