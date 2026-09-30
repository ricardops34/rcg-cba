import { Module } from '@nestjs/common';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';
import { PoliticaSenhaModule } from '../politica-senha/politica-senha.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PoliticaSenhaModule, AuthModule],
  controllers: [UsuariosController],
  providers: [UsuariosService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
