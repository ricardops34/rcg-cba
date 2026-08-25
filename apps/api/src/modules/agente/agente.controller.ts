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
  AGENTE_FERRAMENTA_EXAMPLE,
  AGENTE_RESPOSTA_EXAMPLE,
} from '@plataforma/contracts';
import { AgenteConfigService } from './agente-config.service';
import { AgenteChatService } from './agente-chat.service';
import { AgenteFerramentasService } from './agente-ferramentas.service';
import {
  AgenteConfigUpdateDto,
  AgenteEnvioDto,
  AgenteFerramentaUpdateDto,
  AgenteOauthConcluirDto,
  AgenteOauthImportarDto,
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
    private readonly ferramentas: AgenteFerramentasService,
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
  @ApiBodyExample({ ativo: true, temperatura: 0.3, modelo: 'gpt-5.6-sol' })
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

  // ---------------- ferramentas ----------------

  @ApiOperation({
    summary: 'Ferramentas do agente e sua configuração',
    description:
      'Catálogo do código cruzado com o que a empresa configurou: ligada/desligada, textos ' +
      'reescritos e perfis liberados. A `permissao` de cada ferramenta é do código e não é ' +
      'editável — a configuração restringe, nunca amplia. Requer agente-config.visualizar.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: [AGENTE_FERRAMENTA_EXAMPLE] },
  })
  @RequirePermission('agente-config', 'visualizar')
  @Get('ferramentas')
  listarFerramentas(@CurrentUser() user: AuthenticatedUser) {
    return this.ferramentas.listar(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Configurar uma ferramenta',
    description:
      'Liga/desliga, reescreve nome e descrição (vazio volta ao texto do código) e define ' +
      'os perfis com direito de uso (lista vazia = todos os que tiverem a permissão). ' +
      'Requer agente-config.editar.',
  })
  @ApiBodyExample({ ativa: true, descricao: 'Use para...', perfilIds: [] })
  @RequirePermission('agente-config', 'editar')
  @Put('ferramentas/:chave')
  atualizarFerramenta(
    @Param('chave') chave: string,
    @Body() dto: AgenteFerramentaUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ferramentas.atualizar(user.empresaAtivaId, user, chave, dto);
  }

  // ---------------- conexão OAuth (Codex) ----------------

  @ApiOperation({
    summary: 'Iniciar a conexão com a conta ChatGPT',
    description:
      'Devolve a URL de autorização para o administrador abrir no navegador. O redirect vai ' +
      'para localhost:1455 (cliente OAuth do Codex CLI, que não pode ser trocado), então a ' +
      'página **vai falhar** — é o esperado. O que vale é a URL da barra de endereço, que ' +
      'volta em `POST config/oauth/concluir`. Requer agente-config.editar.',
  })
  @RequirePermission('agente-config', 'editar')
  @Post('config/oauth/iniciar')
  iniciarOauth(@CurrentUser() user: AuthenticatedUser) {
    return this.config.iniciarOauth(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Concluir a conexão com a URL de retorno',
    description:
      'Recebe a URL de retorno colada (ou só o código) e grava a conexão. O código vale uma ' +
      'única vez e expira em minutos. Requer agente-config.editar.',
  })
  @ApiBodyExample({
    retorno: 'http://localhost:1455/auth/callback?code=ac_123&state=abc',
  })
  @RequirePermission('agente-config', 'editar')
  @Post('config/oauth/concluir')
  concluirOauth(
    @Body() dto: AgenteOauthConcluirDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.config.concluirOauth(user.empresaAtivaId, user, dto.retorno);
  }

  @ApiOperation({
    summary: 'Importar a sessão de um Codex CLI já logado',
    description:
      'Atalho para quem já usa o `codex` na própria máquina: cola o conteúdo de ' +
      '`~/.codex/auth.json`. O access token do arquivo é ignorado e renovado na hora, o que ' +
      'de quebra valida o refresh token. Requer agente-config.editar.',
  })
  @RequirePermission('agente-config', 'editar')
  @Post('config/oauth/importar')
  importarOauth(
    @Body() dto: AgenteOauthImportarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.config.importarOauth(user.empresaAtivaId, user, dto.conteudo);
  }

  @ApiOperation({
    summary: 'Desconectar a conta ChatGPT',
    description: 'Apaga os tokens gravados. Requer agente-config.editar.',
  })
  @RequirePermission('agente-config', 'editar')
  @Post('config/oauth/desconectar')
  desconectarOauth(@CurrentUser() user: AuthenticatedUser) {
    return this.config.desconectarOauth(user.empresaAtivaId, user);
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
