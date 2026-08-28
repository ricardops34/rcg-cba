import { Body, Controller, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PortalClienteAuthService } from './portal-cliente-auth.service';
import { PortalClienteLoginDto, PortalClienteRefreshDto } from './dto/portal-cliente.dto';

@Controller('portal-cliente/auth')
export class PortalClienteAuthController {
  constructor(private readonly auth: PortalClienteAuthService) {}

  private meta(req: Request) {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: PortalClienteLoginDto, @Req() req: Request) {
    return this.auth.login(dto, this.meta(req));
  }

  @Post('refresh')
  refresh(@Body() dto: PortalClienteRefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto, this.meta(req));
  }

  @Post('logout')
  logout(@Body() dto: PortalClienteRefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }
}
