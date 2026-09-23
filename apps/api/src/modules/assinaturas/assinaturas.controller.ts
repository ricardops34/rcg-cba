import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
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

@ApiTags('plataforma-assinaturas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('plataforma')
export class AssinaturasController {
  constructor(private readonly service: AssinaturasService) {}

  @ApiOperation({ summary: 'Resumo SaaS (MRR, empresas ativas, inadimplentes)' })
  @Get('assinaturas/resumo')
  getResumoSaaS() {
    return this.service.getResumoSaaS();
  }

  @ApiOperation({ summary: 'Listar assinaturas de todas as empresas' })
  @Get('assinaturas')
  listAssinaturas() {
    return this.service.listAssinaturas();
  }

  @ApiOperation({ summary: 'Obter assinatura de uma empresa' })
  @ApiParam({ name: 'empresaId' })
  @Get('empresas/:empresaId/assinatura')
  getAssinaturaEmpresa(@Param('empresaId') empresaId: string) {
    return this.service.getAssinaturaEmpresa(empresaId);
  }

  @ApiOperation({ summary: 'Atualizar assinatura/mensalidade de uma empresa' })
  @ApiParam({ name: 'empresaId' })
  @Patch('empresas/:empresaId/assinatura')
  updateAssinaturaEmpresa(
    @Param('empresaId') empresaId: string,
    @Body() dto: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateAssinaturaEmpresa(empresaId, dto, user.id);
  }
}
