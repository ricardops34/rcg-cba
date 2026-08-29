import { Module } from '@nestjs/common';
import { PerfisController } from './perfis.controller';
import { PerfisService } from './perfis.service';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';

@Module({
  controllers: [PerfisController],
  providers: [PerfisService, PlatformAdminGuard],
  exports: [PerfisService],
})
export class PerfisModule {}
