import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ACESSO_LOG_EXAMPLE,
  ACESSO_RESUMO_EXAMPLE,
  SESSAO_EXAMPLE,
} from '@plataforma/contracts';
import { AcessosService } from './acessos.service';
import { AcessoQueryDto } from './dto/acesso.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

/**
 * Auditoria de acesso (Administração > Acessos) — só leitura: o registro é
 * feito pelo fluxo de autenticação, nunca por esta API. Todas as rotas são
 * restritas aos usuários da empresa ativa (ver AcessosService) e exigem
 * `acessos.visualizar`.
 */
@ApiTags('acessos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('acessos', 'visualizar')
@Controller('acessos')
export class AcessosController {
  constructor(private readonly service: AcessosService) {}

  @ApiOperation({
    summary: 'Eventos de acesso do período',
    description:
      'Logins, saídas e tentativas sem sucesso (senha incorreta, conta bloqueada, ' +
      'fora do expediente), do mais recente para o mais antigo. Sem dataInicio/dataFim, ' +
      'considera os últimos 30 dias. Tentativa com e-mail que não existe no cadastro só ' +
      'aparece para o perfil de sistema.',
  })
  @ApiPaginationQuery()
  @ApiResponse({ status: 200, schema: { example: [ACESSO_LOG_EXAMPLE] } })
  @Get()
  eventos(
    @Query() query: AcessoQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listarEventos(user.empresaAtivaId, user, query);
  }

  @ApiOperation({
    summary: 'Sessões do período, com tempo de uso',
    description:
      'Uma linha por sessão (do login até a saída ou a última renovação de token), com ' +
      'a duração em minutos. Sessão sem encerramento e com atividade nos últimos 40 ' +
      'minutos aparece como ativa.',
  })
  @ApiPaginationQuery()
  @ApiResponse({ status: 200, schema: { example: [SESSAO_EXAMPLE] } })
  @Get('sessoes')
  sessoes(
    @Query() query: AcessoQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listarSessoes(user.empresaAtivaId, query);
  }

  @ApiOperation({
    summary: 'Resumo do período e tempo de uso por usuário',
    description:
      'Totais do período (logins, tentativas sem sucesso, sessões abertas, tempo total e ' +
      'médio) e o tempo de uso por usuário, do maior para o menor. Os totais ignoram os ' +
      'filtros de evento da listagem — são sempre o período inteiro.',
  })
  @ApiResponse({ status: 200, schema: { example: ACESSO_RESUMO_EXAMPLE } })
  @Get('resumo')
  resumo(
    @Query() query: AcessoQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.resumo(user.empresaAtivaId, user, query);
  }
}
