import { ClientesModule } from '../clientes/clientes.module';
import { Module } from '@nestjs/common';
import { PlataformaController } from './plataforma.controller';
import { PlataformaService } from './plataforma.service';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';

@Module({
  imports: [ClientesModule],
  controllers: [PlataformaController],
  providers: [PlataformaService, PlatformAdminGuard],
})
export class PlataformaModule {}
