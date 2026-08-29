import { Module } from '@nestjs/common';
import { EstruturaController } from './estrutura.controller';
import { EstruturaService } from './estrutura.service';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';

@Module({
  controllers: [EstruturaController],
  providers: [EstruturaService, PlatformAdminGuard],
  exports: [EstruturaService],
})
export class EstruturaModule {}
