import { ClientesModule } from '../clientes/clientes.module';
import { Module } from '@nestjs/common';
import { EmpresasController } from './empresas.controller';
import { EmpresasService } from './empresas.service';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';

@Module({
  imports: [ClientesModule],
  controllers: [EmpresasController],
  providers: [EmpresasService, PlatformAdminGuard],
  exports: [EmpresasService],
})
export class EmpresasModule {}
