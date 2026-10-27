import { Module } from '@nestjs/common';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';
import { PoliticaSenhaModule } from '../politica-senha/politica-senha.module';
import { AuthModule } from '../auth/auth.module';
import { ParametrosModule } from '../parametros/parametros.module';
import { SmsModule } from '../sms/sms.module';
import { EmailConfigModule } from '../email/email-config.module';
import { EntregaSenhaService } from './entrega-senha.service';

@Module({
  imports: [
    PoliticaSenhaModule,
    AuthModule,
    ParametrosModule,
    SmsModule,
    EmailConfigModule,
  ],
  controllers: [UsuariosController],
  providers: [UsuariosService, EntregaSenhaService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
