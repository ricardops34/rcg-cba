import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { CurrentPortalCliente } from './portal-cliente-user.decorator';
import type { PortalClienteUser } from './portal-cliente-auth.types';
import { PortalClienteGuard } from './portal-cliente.guard';
import { PortalClienteService } from './portal-cliente.service';

class DecisaoOrcamentoDto extends createZodDto(
  z.object({ observacao: z.string().trim().max(1000).optional() }),
) {}

@UseGuards(PortalClienteGuard)
@Controller('portal-cliente')
export class PortalClienteController {
  constructor(private readonly portal: PortalClienteService) {}

  @Get('me')
  me(@CurrentPortalCliente() user: PortalClienteUser) {
    return this.portal.me(user);
  }

  @Get('orcamentos')
  orcamentos(@CurrentPortalCliente() user: PortalClienteUser) {
    return this.portal.listarOrcamentos(user);
  }

  @Patch('orcamentos/:id/aprovar')
  aprovar(
    @CurrentPortalCliente() user: PortalClienteUser,
    @Param('id') id: string,
    @Body() dto: DecisaoOrcamentoDto,
  ) {
    return this.portal.decidirOrcamento(user, id, 'aprovado', dto.observacao);
  }

  @Patch('orcamentos/:id/recusar')
  recusar(
    @CurrentPortalCliente() user: PortalClienteUser,
    @Param('id') id: string,
    @Body() dto: DecisaoOrcamentoDto,
  ) {
    return this.portal.decidirOrcamento(user, id, 'recusado', dto.observacao);
  }
}
