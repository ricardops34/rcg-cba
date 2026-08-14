import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AGENTE_CONFIG_EXAMPLE,
  AGENTE_RESPOSTA_EXAMPLE,
} from '@plataforma/contracts';
import { AgenteConfigService } from './agente-config.service';
import { AgenteChatService } from './agente-chat.service';
import {
  AgenteConfigUpdateDto,
  AgenteEnvioDto,
  AgenteTestarConexaoDto,
} from './dto/agente.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiBodyExample } from '../../common/decorators/api-body-example.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('agente')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('agente')
export class AgenteController {
  constructor(
    private readonly config: AgenteConfigService,
    private readonly chat: AgenteChatService,
  ) {}

  // ---------------- configuração ----------------

  @ApiOperation({
    summary: 'Configuração do agente na empresa ativa',
    description:
      'Singleton por empresa, criado no primeiro acesso. A chave de API nunca é devolvida — ' +
      'só os últimos 4 caracteres e a marca de preenchida. Requer agente-config.visualizar.',
  })
  @ApiResponse({ status: 200, schema: { example: AGENTE_CONFIG_EXAMPLE } })
  @RequirePermission('agente-config', 'visualizar')
  @Get('config')
  obterConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.config.obter(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Editar a configuração do agente',
    description:
      'Personalidade (system prompt), temperatura, modelo e chave de API. Chave em branco ' +
      'mantém a atual. Requer agente-config.editar.',
  })
  @ApiBodyExample({ ativo: true, temperatura: 0.3, modelo: 'grok-4-fast' })
  @RequirePermission('agente-config', 'editar')
  @Put('config')
  atualizarConfig(
    @Body() dto: AgenteConfigUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.config.atualizar(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({
    summary: 'Testar a conexão com o provedor',
    description:
      'Valida a chave contra o provedor e devolve os modelos disponíveis na conta — assim o ' +
      'campo "modelo" é conferido contra a realidade, não contra uma lista fixa. Aceita uma ' +
      'chave no corpo para testar antes de gravar. Requer agente-config.editar.',
  })
  @RequirePermission('agente-config', 'editar')
  @Post('config/testar')
  testar(
    @Body() dto: AgenteTestarConexaoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.config.testarConexao(
      user.empresaAtivaId,
      dto.apiKey,
      dto.provedor,
    );
  }

  // ---------------- conversa ----------------

  @ApiOperation({
    summary: 'Minhas conversas com o agente',
    description: 'Conversas do próprio usuário. Requer agente.visualizar.',
  })
  @RequirePermission('agente', 'visualizar')
  @Get('conversas')
  listar(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.listarConversas(user.empresaAtivaId, user);
  }

  @ApiOperation({
    summary: 'Detalhar conversa',
    description:
      'Mensagens da conversa. Uma conversa é do usuário que a criou — ninguém lê a dos outros. ' +
      'Requer agente.visualizar.',
  })
  @RequirePermission('agente', 'visualizar')
  @Get('conversas/:id')
  detalhar(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.detalhar(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Enviar mensagem ao agente',
    description:
      'O agente responde consultando as ferramentas que o usuário tem permissão de usar — o ' +
      'catálogo enviado ao modelo já vem filtrado, e a permissão é revalidada na execução. ' +
      'Ações que gravam NÃO são executadas: voltam em `pendencias` para o usuário confirmar. ' +
      'Sem conversaId, abre uma conversa nova. Requer agente.visualizar.',
  })
  @ApiBodyExample({
    texto: 'Quanto o cliente XPTO comprou nos últimos 6 meses?',
  })
  @ApiResponse({ status: 201, schema: { example: AGENTE_RESPOSTA_EXAMPLE } })
  // Chamada externa é paga e lenta: limite bem abaixo do global (200/min).
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequirePermission('agente', 'visualizar')
  @Post('conversas/mensagens')
  enviar(@Body() dto: AgenteEnvioDto, @CurrentUser() user: AuthenticatedUser) {
    return this.chat.enviar(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({
    summary: 'Confirmar uma ação pendente',
    description:
      'Executa de verdade a ação que o agente preparou (ex.: criar orçamento). Revalida a ' +
      'permissão no momento da confirmação. Responde 409 se já foi confirmada ou cancelada. ' +
      'Requer agente.visualizar (mais a permissão da própria ação).',
  })
  @RequirePermission('agente', 'visualizar')
  @Post('conversas/:id/confirmar/:pendenciaId')
  confirmar(
    @Param('id') id: string,
    @Param('pendenciaId') pendenciaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chat.confirmar(user.empresaAtivaId, user, id, pendenciaId);
  }

  @ApiOperation({
    summary: 'Cancelar uma ação pendente',
    description: 'Fecha a pendência sem executar. Requer agente.visualizar.',
  })
  @RequirePermission('agente', 'visualizar')
  @Post('conversas/:id/cancelar/:pendenciaId')
  cancelar(
    @Param('id') id: string,
    @Param('pendenciaId') pendenciaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chat.cancelar(user.empresaAtivaId, user, id, pendenciaId);
  }
}
