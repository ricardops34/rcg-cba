import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class PortalClienteGuard extends AuthGuard('portal-cliente-jwt') {}
