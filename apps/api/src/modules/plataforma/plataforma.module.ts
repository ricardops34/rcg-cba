import { Module } from '@nestjs/common';
import { PlataformaController } from './plataforma.controller';
import { PlataformaService } from './plataforma.service';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';

@Module({
  controllers: [PlataformaController],
  providers: [PlataformaService, PlatformAdminGuard],
})
export class PlataformaModule {}
