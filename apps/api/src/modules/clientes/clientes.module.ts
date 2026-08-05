import { Module } from '@nestjs/common';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';
import { ClienteCampoConfigModule } from '../cliente-campo-config/cliente-campo-config.module';

@Module({
  imports: [ClienteCampoConfigModule],
  controllers: [ClientesController],
  providers: [ClientesService],
  exports: [ClientesService],
})
export class ClientesModule {}
