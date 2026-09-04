import { Module } from '@nestjs/common';
import { EmpresasController } from './empresas.controller';
import { EmpresasService } from './empresas.service';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';

@Module({
  controllers: [EmpresasController],
  providers: [EmpresasService, PlatformAdminGuard],
  exports: [EmpresasService],
})
export class EmpresasModule {}
