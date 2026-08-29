import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';

export interface JwtPayload {
  sub: string;
  nome: string;
  email: string;
  empresaAtivaId: string;
  isAdmin: boolean;
  administradorPlataforma?: boolean;
  permissoes: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    // Sem fallback de propósito: um valor default conhecido (ex. 'dev-secret')
    // commitado no repo viraria um bypass de autenticação completo caso a env
    // var falhe silenciosamente em produção (var não setada, nome errado,
    // secret manager não conectado). Falha alto e cedo, no boot, em vez de
    // aceitar silenciosamente tokens assinados com um segredo público.
    if (!process.env.JWT_ACCESS_SECRET) {
      throw new Error('JWT_ACCESS_SECRET não configurado');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET,
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return {
      id: payload.sub,
      nome: payload.nome,
      email: payload.email,
      empresaAtivaId: payload.empresaAtivaId,
      isAdmin: payload.isAdmin,
      administradorPlataforma: payload.administradorPlataforma === true,
      permissoes: payload.permissoes,
    };
  }
}
