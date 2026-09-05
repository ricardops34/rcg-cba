import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ERRO_LOG_CONFIG_EXAMPLE,
  ERRO_LOG_GRUPO_EXAMPLE,
} from '@plataforma/contracts';
import { ErrosLogService } from './erros-log.service';
import {
  ErroLogConfigUpdateDto,
  ErroLogOcorrenciaQueryDto,
  ErroLogQueryDto,
} from './dto/erro-log.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

/**
 * Leitura do log de erros — **só administração da plataforma**.
 *
 * Sem `PermissionsGuard`, pelo mesmo motivo do `PlataformaController`: os
 * perfis são globais e compartilhados por todas as empresas, então uma
 * permissão daria acesso a todo administrador de tenant. Aqui o corte é o
 * atributo `administradorPlataforma`.
 *
 * A decisão de fechar no administrador do SaaS é do usuário e tem uma razão
 * concreta: mensagem e stack carregam dado real (um 500 numa consulta traz
 * nome de cliente). Filtrá-los antes de gravar custaria o próprio
 * diagnóstico; então grava-se inteiro e restringe-se quem lê.
 */
@ApiTags('plataforma')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('plataforma/erros')
export class PlataformaErrosController {
  constructor(private readonly service: ErrosLogService) {}

  @ApiOperation({
    summary: 'Erros agrupados',
    description:
      'Uma linha por assinatura (origem + tipo + rota + método + status + mensagem ' +
      'normalizada), com o total de ocorrências. Sem período informado, considera ' +
      'os últimos 7 dias. Mais recentes primeiro.',
  })
  @ApiPaginationQuery()
  @ApiResponse({ status: 200, schema: { example: [ERRO_LOG_GRUPO_EXAMPLE] } })
  @Get()
  listar(@Query() query: ErroLogQueryDto) {
    return this.service.listarGrupos(query);
  }

  @ApiOperation({
    summary: 'Números do período',
    description:
      'Cartões do topo da tela: ocorrências, grupos e empresas afetadas.',
  })
  @Get('resumo')
  resumo(@Query() query: ErroLogQueryDto) {
    return this.service.resumo(query);
  }

  @ApiOperation({
    summary: 'Ocorrências de um grupo',
    description:
      'O detalhe de uma assinatura, com stack, usuário, empresa e IP de cada ' +
      'ocorrência. É o que abre ao clicar numa linha da listagem.',
  })
  @ApiPaginationQuery()
  @Get('ocorrencias')
  ocorrencias(@Query() query: ErroLogOcorrenciaQueryDto) {
    return this.service.listarOcorrencias(query);
  }

  @ApiOperation({
    summary: 'Ler a governança do log',
    description: 'Retenção em dias, teto por empresa e o interruptor de 4xx.',
  })
  @ApiResponse({ status: 200, schema: { example: ERRO_LOG_CONFIG_EXAMPLE } })
  @Get('config')
  lerConfig() {
    return this.service.lerConfig();
  }

  @ApiOperation({
    summary: 'Alterar a governança do log',
    description:
      'Retenção (0 = sem expurgo), teto por empresa (0 = sem teto) e se os 4xx ' +
      'também são gravados. O interruptor de 4xx é para investigação pontual: ' +
      'ligado por padrão, o log enche de "campo obrigatório" e esconde o 500.',
  })
  @Patch('config')
  atualizarConfig(
    @Body() dto: ErroLogConfigUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.atualizarConfig(dto, user.email);
  }

  @ApiOperation({
    summary: 'Apagar um grupo de erros',
    description:
      'Remove todas as ocorrências da assinatura — o "já resolvi isto" da tela. ' +
      'Se o erro voltar a acontecer, a linha nasce de novo.',
  })
  @Delete(':assinatura')
  remover(@Param('assinatura') assinatura: string) {
    return this.service.removerGrupo(assinatura);
  }
}
