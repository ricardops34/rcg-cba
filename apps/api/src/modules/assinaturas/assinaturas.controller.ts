import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { AssinaturasService } from './assinaturas.service';
import { createZodDto } from 'nestjs-zod';
import { assinaturaUpdateSchema } from '@plataforma/contracts';

class AssinaturaUpdateDto extends createZodDto(assinaturaUpdateSchema) {}

@ApiTags('plataforma-assinaturas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('plataforma')
export class AssinaturasController {
  constructor(private readonly service: AssinaturasService) {}

  @ApiOperation({ summary: 'Obter o contrato único do grupo econômico' })
  @Get('grupos/:grupoId/assinatura')
  getGrupo(@Param('grupoId') grupoId: string) {
    return this.service.getAssinaturaGrupo(grupoId);
  }

  @ApiOperation({
    summary: 'Configurar o plano e a assinatura de todas as empresas do grupo',
  })
  @Patch('grupos/:grupoId/assinatura')
  updateGrupo(
    @Param('grupoId') grupoId: string,
    @Body() dto: AssinaturaUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateAssinaturaGrupo(grupoId, dto, user.id);
  }

  @ApiOperation({
    summary: 'Resumo SaaS (MRR, grupos ativos, inadimplentes)',
  })
  @Get('assinaturas/resumo')
  getResumoSaaS() {
    return this.service.getResumoSaaS();
  }

  @ApiOperation({ summary: 'Listar assinaturas dos grupos econômicos' })
  @Get('assinaturas')
  listAssinaturas() {
    return this.service.listAssinaturas();
  }

  @ApiOperation({ summary: 'Obter a assinatura do grupo de uma empresa' })
  @ApiParam({ name: 'empresaId' })
  @Get('empresas/:empresaId/assinatura')
  getAssinaturaEmpresa(@Param('empresaId') empresaId: string) {
    return this.service.getAssinaturaEmpresa(empresaId);
  }

  @ApiOperation({
    summary: 'Atualizar assinatura/mensalidade do grupo de uma empresa',
  })
  @ApiParam({ name: 'empresaId' })
  @Patch('empresas/:empresaId/assinatura')
  updateAssinaturaEmpresa(
    @Param('empresaId') empresaId: string,
    @Body() dto: AssinaturaUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateAssinaturaEmpresa(empresaId, dto, user.id);
  }
}
