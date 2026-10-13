import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { BackupEmpresaService } from './backup-empresa.service';

/**
 * Backup da **própria empresa**, para o administrador dela (Administração >
 * Backups) — decisão do usuário de 2026-10-13, que ampliou o "só a
 * plataforma" do mesmo dia.
 *
 * A empresa é **sempre** a ativa do token: nenhuma rota recebe `empresaId`,
 * então não há como pedir o backup de outra. O id do backup é procurado
 * dentro da empresa ativa (`buscar` filtra pelos dois).
 */
@ApiTags('backups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('backups')
export class BackupsController {
  constructor(private readonly service: BackupEmpresaService) {}

  @ApiOperation({
    summary: 'Backups da empresa ativa, do mais recente ao mais antigo',
  })
  @RequirePermission('backups', 'visualizar')
  @Get()
  listar(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listarDaEmpresa(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Gerar backup da empresa ativa agora',
    description:
      'Responde na hora com o backup "gerando"; a geração corre em segundo plano.',
  })
  @RequirePermission('backups', 'exportar')
  @Post()
  @HttpCode(202)
  gerar(@CurrentUser() user: AuthenticatedUser) {
    return this.service.solicitar(user.empresaAtivaId, 'manual', user.id);
  }

  @ApiOperation({ summary: 'Link de download (5 minutos)' })
  @RequirePermission('backups', 'exportar')
  @Get(':id/link')
  link(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.link(user.empresaAtivaId, id);
  }

  @ApiOperation({ summary: 'Excluir um backup da empresa ativa' })
  @RequirePermission('backups', 'excluir')
  @Delete(':id')
  excluir(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.excluir(user.empresaAtivaId, id);
  }
}
