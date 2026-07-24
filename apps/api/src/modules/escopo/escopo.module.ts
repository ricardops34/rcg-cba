import { Module } from '@nestjs/common';
import { EscopoController } from './escopo.controller';
import { EscopoService } from './escopo.service';

@Module({
  controllers: [EscopoController],
  providers: [EscopoService],
  exports: [EscopoService],
})
export class EscopoModule {}
