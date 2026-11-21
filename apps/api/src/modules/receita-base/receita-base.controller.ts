import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReceitaBaseService } from './receita-base.service';
import { ReceitaReferenciasService } from './receita-referencias.service';
import {
  ReceitaBaseCargaDto,
  ReceitaBaseConfigSalvarDto,
} from './receita-base.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

/**
 * Administração > Base da Receita: parâmetros da base própria e da coleta de
 * leads, estado da base e a carga (docs/planos/2026-11-20-prospeccao-leads-receita.md).
 * Rotina `base-receita`, só administradores.
 */
@ApiTags('receita-base')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('receita-base')
export class ReceitaBaseController {
  constructor(
    private readonly service: ReceitaBaseService,
    private readonly referencias: ReceitaReferenciasService,
  ) {}

  @ApiOperation({ summary: 'Parâmetros da base própria e da coleta' })
  @RequirePermission('base-receita', 'visualizar')
  @Get('configuracao')
  config(@CurrentUser() user: AuthenticatedUser) {
    return this.service.config(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Gravar os parâmetros',
    description:
      'O token do controle só muda quando vem preenchido (é gravado cifrado).',
  })
  @RequirePermission('base-receita', 'editar')
  @Put('configuracao')
  salvar(
    @Body() dto: ReceitaBaseConfigSalvarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.salvarConfig(user.empresaAtivaId, user.id, dto);
  }

  @ApiOperation({
    summary: 'Estado da base própria e da carga',
    description:
      'Mês carregado, tamanho, carga em andamento (com as últimas linhas) e o ' +
      'que a próxima carga gravaria (união das empresas).',
  })
  @RequirePermission('base-receita', 'visualizar')
  @Get('estado')
  estado(@CurrentUser() user: AuthenticatedUser) {
    return this.service.estado(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Carregar a base própria',
    description:
      'Baixa o mês da Receita (vazio = o mais recente) e grava só os estados ' +
      'e situações marcados. Leva horas; a coleta pela base própria espera.',
  })
  @RequirePermission('base-receita', 'editar')
  @Post('carga')
  carregar(
    @Body() dto: ReceitaBaseCargaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.carregar(user.empresaAtivaId, dto.mes || undefined);
  }

  @ApiOperation({
    summary: 'Atualizar as tabelas de referência pela Receita',
    description:
      'Grava o código da Receita nos municípios (tabela do Tesouro e, para ' +
      'município novo, nome + UF), as naturezas jurídicas e os CNAEs que ' +
      'faltam. Tabelas globais: vale para todas as empresas.',
  })
  @RequirePermission('base-receita', 'editar')
  @Post('referencias')
  atualizarReferencias(@CurrentUser() user: AuthenticatedUser) {
    return this.referencias.atualizarReferencias(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Gravar na tabela de CEPs os CEPs da base própria',
    description:
      'Só os CEPs que a tabela ainda não tem (o ViaCEP não é sobrescrito), ' +
      'com o endereço mais frequente entre as empresas de cada um.',
  })
  @RequirePermission('base-receita', 'editar')
  @Post('ceps')
  atualizarCeps(@CurrentUser() user: AuthenticatedUser) {
    return this.referencias.atualizarCeps(user.empresaAtivaId);
  }
}
