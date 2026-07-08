import { Module } from '@nestjs/common';
import { EstruturaController } from './estrutura.controller';
import { EstruturaService } from './estrutura.service';

@Module({
  controllers: [EstruturaController],
  providers: [EstruturaService],
  exports: [EstruturaService],
})
export class EstruturaModule {}
