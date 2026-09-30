import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PoliticaSenhaModule } from '../politica-senha/politica-senha.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), PoliticaSenhaModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // O cadastro de usuário reusa a foto e a tela inicial do próprio perfil.
  exports: [AuthService],
})
export class AuthModule {}
