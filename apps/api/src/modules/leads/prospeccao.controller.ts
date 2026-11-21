import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProspeccaoService } from './prospeccao.service';
import { ProspeccaoColetaCriarDto } from './dto/prospeccao.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

/**
 * Prospecção de leads pela base da Receita: coletar empresas por UF,
 * municípios e CNAEs (docs/planos/2026-11-20-prospeccao-leads-receita.md).
 * Rotina `prospeccao-leads`: Supervisor, Gerente, Diretor e administradores.
 */
@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('leads/prospeccao')
export class ProspeccaoController {
  constructor(private readonly service: ProspeccaoService) {}

  @ApiOperation({
    summary: 'Municípios da UF com código IBGE (filtro da coleta)',
  })
  @RequirePermission('prospeccao-leads', 'visualizar')
  @Get('municipios')
  municipios(@Query('uf') uf: string) {
    return this.service.municipios(uf ?? '');
  }

  @ApiOperation({
    summary: 'Fonte e limites da coleta (parâmetros PROSPECCAO_*)',
  })
  @RequirePermission('prospeccao-leads', 'visualizar')
  @Get('limites')
  limites(@CurrentUser() user: AuthenticatedUser) {
    return this.service.limites(user.empresaAtivaId);
  }

  @ApiOperation({ summary: 'CNAEs (subclasse) por descrição ou código' })
  @RequirePermission('prospeccao-leads', 'visualizar')
  @Get('cnaes')
  cnaes(@Query('search') search: string) {
    return this.service.cnaes(search ?? '');
  }

  @ApiOperation({
    summary: 'Coletas recentes, com contagens e progresso',
    description:
      'As 30 mais recentes da empresa. Requer prospeccao-leads.visualizar.',
  })
  @RequirePermission('prospeccao-leads', 'visualizar')
  @Get('coletas')
  coletas(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listarColetas(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Iniciar uma coleta',
    description:
      'Percorre cada município × CNAE na base da Receita, em segundo plano, e ' +
      'importa como lead (origem receita, sem vendedor) as empresas ativas que ' +
      'não são clientes nem leads. Uma coleta por empresa de cada vez. ' +
      'Requer prospeccao-leads.cadastrar.',
  })
  @RequirePermission('prospeccao-leads', 'cadastrar')
  @Post('coletas')
  iniciar(
    @Body() dto: ProspeccaoColetaCriarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.iniciarColeta(user.empresaAtivaId, user, dto);
  }
}
