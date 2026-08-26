import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { POLITICA_SENHA_EXAMPLE } from '@plataforma/contracts';
import { PoliticaSenhaService } from './politica-senha.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

/**
 * Só leitura. A política deixou de ter tela própria em 2026-08-26 e virou
 * parâmetro por empresa (Administração > Parâmetros) — quem grava é aquela
 * tela. O que existe aqui é o que as telas de senha precisam para **mostrar os
 * requisitos antes de o usuário digitar**: sem isso o formulário aceita a
 * senha e o backend recusa, com o usuário sem saber o que faltou.
 *
 * São três rotas porque a política aplicável depende de para **quem** a senha
 * está sendo definida, e cada uma espelha a validação que o backend fará:
 * `validarSenhaDoUsuario` (a mais restritiva entre as empresas da conta) ou
 * `validarSenhaDaEmpresa`. Uma rota só devolveria requisitos diferentes dos
 * que serão cobrados.
 */
@ApiTags('politica-senha')
@ApiBearerAuth()
@Controller('politica-senha')
export class PoliticaSenhaController {
  constructor(private readonly service: PoliticaSenhaService) {}

  @ApiOperation({
    summary: 'Política vigente para a própria conta',
    description:
      'A mais restritiva entre as empresas ativas do usuário logado — é o que ' +
      'a troca da própria senha valida. Qualquer usuário autenticado consulta: ' +
      'trocar a própria senha não exige permissão de admin, então não colocar ' +
      '@RequirePermission aqui.',
  })
  @ApiResponse({ status: 200, schema: { example: POLITICA_SENHA_EXAMPLE } })
  @UseGuards(JwtAuthGuard)
  @Get()
  getDaPropriaConta(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getVigenteParaUsuario(user.id);
  }

  @ApiOperation({
    summary: 'Política vigente na empresa ativa',
    description:
      'Para a senha inicial de um usuário novo, que ainda não tem vínculo — ' +
      'é a política que `validarSenhaDaEmpresa` cobra na criação.',
  })
  @ApiResponse({ status: 200, schema: { example: POLITICA_SENHA_EXAMPLE } })
  @UseGuards(JwtAuthGuard)
  @Get('empresa-ativa')
  getDaEmpresaAtiva(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getVigenteDaEmpresa(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Política vigente para outro usuário',
    description:
      'Para o reset de senha feito por admin: quem manda é a política do ' +
      'usuário alvo, que pode estar em empresas mais exigentes que a de quem ' +
      'faz o reset. Mesma permissão do reset.',
  })
  @ApiResponse({ status: 200, schema: { example: POLITICA_SENHA_EXAMPLE } })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('usuarios', 'editar')
  @Get('usuario/:id')
  getDeUsuario(@Param('id') id: string) {
    return this.service.getVigenteParaUsuario(id);
  }
}
