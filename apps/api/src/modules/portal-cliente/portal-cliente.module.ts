import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PortalClienteAuthController } from './portal-cliente-auth.controller';
import { PortalClienteAuthService } from './portal-cliente-auth.service';
import { PortalClienteController } from './portal-cliente.controller';
import { PortalClienteGuard } from './portal-cliente.guard';
import { PortalClienteService } from './portal-cliente.service';
import { PortalClienteStrategy } from './portal-cliente.strategy';
import { PortalClienteAdminController } from './portal-cliente-admin.controller';
import { PortalClienteAdminService } from './portal-cliente-admin.service';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [PortalClienteAuthController, PortalClienteController, PortalClienteAdminController],
  providers: [
    PortalClienteAuthService,
    PortalClienteService,
    PortalClienteStrategy,
    PortalClienteGuard,
    PortalClienteAdminService,
  ],
})
export class PortalClienteModule {}
