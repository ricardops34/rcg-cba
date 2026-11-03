import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { PersonificacaoService } from './personificacao.service';

/** Log de auditoria de "Testar como este usuário" — mesma permissão do cadastro de usuários. */
@ApiTags('personificacao')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('personificacao')
export class PersonificacaoController {
  constructor(private readonly service: PersonificacaoService) {}

  @ApiOperation({
    summary: 'Log de auditoria das ações feitas durante "Testar como este usuário"',
  })
  @RequirePermission('usuarios', 'visualizar')
  @Get('logs')
  listLogs(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listLogs(user.empresaAtivaId);
  }
}
