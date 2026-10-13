import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { BackupEmpresaService } from './backup-empresa.service';

class BackupConfigDto {
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  frequenciaDias?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(52)
  manter?: number;
}

/**
 * Backup por empresa — **só administração da plataforma** (decisão de
 * 2026-10-13): o pacote é a empresa inteira. Sem `PermissionsGuard`, pelo
 * mesmo motivo do `PlataformaErrosController`.
 */
@ApiTags('plataforma')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('plataforma/backups')
export class PlataformaBackupsController {
  constructor(private readonly service: BackupEmpresaService) {}

  @ApiOperation({
    summary: 'Empresas e seus backups, do mais recente ao mais antigo',
  })
  @Get()
  listar() {
    return this.service.listar();
  }

  @ApiOperation({ summary: 'Configuração do backup agendado' })
  @Get('config')
  config() {
    return this.service.lerConfig();
  }

  @ApiOperation({
    summary: 'Alterar o backup agendado (frequência, quantos guardar, ligado)',
  })
  @Patch('config')
  atualizarConfig(
    @Body() dto: BackupConfigDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.atualizarConfig(dto, user.id);
  }

  @ApiOperation({
    summary: 'Gerar backup agora',
    description:
      'Responde na hora com o backup "gerando"; a geração corre em segundo plano.',
  })
  @Post(':empresaId')
  @HttpCode(202)
  gerar(
    @Param('empresaId') empresaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.solicitar(empresaId, 'manual', user.id);
  }

  @ApiOperation({ summary: 'Link de download (5 minutos)' })
  @Get(':empresaId/:id/link')
  link(@Param('empresaId') empresaId: string, @Param('id') id: string) {
    return this.service.link(empresaId, id);
  }

  @ApiOperation({ summary: 'Excluir um backup (o pacote e o registro)' })
  @Delete(':empresaId/:id')
  excluir(@Param('empresaId') empresaId: string, @Param('id') id: string) {
    return this.service.excluir(empresaId, id);
  }
}
