import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { PortalClienteJwtPayload, PortalClienteUser } from './portal-cliente-auth.types';

@Injectable()
export class PortalClienteStrategy extends PassportStrategy(Strategy, 'portal-cliente-jwt') {
  constructor() {
    if (!process.env.PORTAL_JWT_ACCESS_SECRET) {
      throw new Error('PORTAL_JWT_ACCESS_SECRET não configurado');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.PORTAL_JWT_ACCESS_SECRET,
      audience: 'portal-cliente',
      ignoreExpiration: false,
    });
  }

  validate(payload: PortalClienteJwtPayload): PortalClienteUser {
    return {
      credencialId: payload.sub,
      empresaId: payload.empresaId,
      clienteId: payload.clienteId,
      contatoId: payload.contatoId,
      perfilId: payload.perfilId,
      nome: payload.nome,
      email: payload.email,
      permissoes: payload.permissoes,
    };
  }
}
