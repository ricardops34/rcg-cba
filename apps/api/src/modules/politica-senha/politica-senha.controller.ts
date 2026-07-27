import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { POLITICA_SENHA_EXAMPLE } from '@plataforma/contracts';
import { PoliticaSenhaService } from './politica-senha.service';
import { PoliticaSenhaUpdateDto } from './dto/politica-senha.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiBodyExample } from '../../common/decorators/api-body-example.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('politica-senha')
@ApiBearerAuth()
@Controller('politica-senha')
export class PoliticaSenhaController {
  constructor(private readonly service: PoliticaSenhaService) {}

  @ApiOperation({
    summary: 'Consultar a política de senha vigente',
    description:
      'Qualquer usuário autenticado pode consultar — necessário para montar os requisitos ' +
      'no formulário de troca da própria senha, mesmo sem a permissão de admin. ' +
      'Não colocar @RequirePermission aqui.',
  })
  @ApiResponse({ status: 200, schema: { example: POLITICA_SENHA_EXAMPLE } })
  @UseGuards(JwtAuthGuard)
  @Get()
  getVigente() {
    return this.service.getVigente();
  }

  @ApiOperation({
    summary: 'Atualizar a política de senha',
    description:
      'Altera os parâmetros globais da plataforma. Requer politica-senha.editar.',
  })
  @ApiBodyExample({ tamanhoMinimo: 10, exigirEspecial: true })
  @ApiResponse({ status: 200, schema: { example: POLITICA_SENHA_EXAMPLE } })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('politica-senha', 'editar')
  @Patch()
  update(
    @Body() dto: PoliticaSenhaUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(dto, user.id);
  }
}
