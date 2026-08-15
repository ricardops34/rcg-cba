import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { WHATSAPP_SESSAO_EXAMPLE } from '@plataforma/contracts';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappSessaoService } from './whatsapp-sessao.service';
import { WhatsappConversasService } from './whatsapp-conversas.service';
import {
  WhatsappConectarDto,
  WhatsappConfigUpdateDto,
  WhatsappConversaQueryDto,
  WhatsappEnviarDto,
  WhatsappMensagemQueryDto,
  WhatsappVincularDto,
} from './dto/whatsapp.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('whatsapp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly config: WhatsappConfigService,
    private readonly sessao: WhatsappSessaoService,
    private readonly conversas: WhatsappConversasService,
  ) {}

  // ---------------- configuração da empresa ----------------

  @ApiOperation({
    summary: 'Configuração de WhatsApp da empresa ativa',
    description:
      'Singleton por empresa, criado no primeiro acesso. Requer whatsapp-config.visualizar.',
  })
  @RequirePermission('whatsapp-config', 'visualizar')
  @Get('config')
  obterConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.config.obter(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Editar a configuração de WhatsApp da empresa',
    description:
      'Transporte, endereço do worker e retenção. Requer whatsapp-config.editar.',
  })
  @RequirePermission('whatsapp-config', 'editar')
  @Put('config')
  atualizarConfig(
    @Body() dto: WhatsappConfigUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.config.atualizar(user.empresaAtivaId, user, dto);
  }

  // ---------------- sessão do vendedor ----------------

  @ApiOperation({
    summary: 'Sessão de WhatsApp do usuário logado',
    description:
      'Devolve null quando o vendedor nunca conectou. Nunca expõe a credencial ' +
      'da sessão. Requer whatsapp-conversas.visualizar.',
  })
  @ApiResponse({ status: 200, schema: { example: WHATSAPP_SESSAO_EXAMPLE } })
  @RequirePermission('whatsapp-conversas', 'visualizar')
  @Get('sessao')
  minhaSessao(@CurrentUser() user: AuthenticatedUser) {
    return this.sessao.minha(user.empresaAtivaId, user);
  }

  @ApiOperation({
    summary: 'Conectar o WhatsApp do vendedor (iniciar pareamento)',
    description:
      'Um número por vendedor: com uma sessão já conectada, é preciso desconectar ' +
      'antes de parear outra. Exige o aceite de que as conversas com clientes são ' +
      'gravadas e visíveis ao supervisor. Requer whatsapp-conversas.editar.',
  })
  @RequirePermission('whatsapp-conversas', 'editar')
  @Post('sessao/conectar')
  conectar(
    @Body() dto: WhatsappConectarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessao.conectar(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({
    summary: 'Estado do pareamento (QR)',
    description:
      'Consultado enquanto o QR não é lido. O código expira em segundos e é ' +
      'renovado pelo provedor — a tela repinta a cada consulta.',
  })
  @RequirePermission('whatsapp-conversas', 'visualizar')
  @Get('sessao/pareamento')
  pareamento(@CurrentUser() user: AuthenticatedUser) {
    return this.sessao.pareamento(user.empresaAtivaId, user);
  }

  @ApiOperation({
    summary: 'Desconectar o próprio WhatsApp',
    description:
      'Age sempre sobre a sessão do usuário logado — não aceita id de outro ' +
      'vendedor. Requer whatsapp-conversas.editar.',
  })
  @RequirePermission('whatsapp-conversas', 'editar')
  @Delete('sessao')
  desconectar(@CurrentUser() user: AuthenticatedUser) {
    return this.sessao.desconectar(user.empresaAtivaId, user);
  }

  @ApiOperation({
    summary: 'Sessões da equipe',
    description:
      'Supervisor/gerente veem as sessões de quem supervisionam. Sem ' +
      'whatsapp-equipe.visualizar, a lista traz apenas a própria sessão.',
  })
  @RequirePermission('whatsapp-conversas', 'visualizar')
  @Get('sessoes')
  listarEquipe(@CurrentUser() user: AuthenticatedUser) {
    return this.sessao.listarEquipe(user.empresaAtivaId, user);
  }

  // ---------------- atendimento ----------------

  @ApiOperation({
    summary: 'Conversas do atendimento',
    description:
      'Filtradas pela sessão: as do próprio vendedor e, com ' +
      'whatsapp-equipe.visualizar, as de quem ele supervisiona.',
  })
  @RequirePermission('whatsapp-conversas', 'visualizar')
  @Get('conversas')
  listarConversas(
    @Query() query: WhatsappConversaQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversas.listar(user.empresaAtivaId, user, query);
  }

  @ApiOperation({
    summary: 'Mensagens de uma conversa',
    description:
      'Ordem cronológica, paginadas por cursor (`antesDe`) — o rolo carrega ' +
      'para trás. Conversa fora do escopo devolve 404.',
  })
  @RequirePermission('whatsapp-conversas', 'visualizar')
  @Get('conversas/:id/mensagens')
  mensagens(
    @Param('id') id: string,
    @Query() query: WhatsappMensagemQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversas.mensagens(user.empresaAtivaId, user, id, query);
  }

  @ApiOperation({
    summary: 'Enviar mensagem',
    description:
      'Só o vendedor dono da sessão envia — o supervisor lê, mas não fala pelo ' +
      'aparelho do subordinado. Requer whatsapp-conversas.cadastrar.',
  })
  @RequirePermission('whatsapp-conversas', 'cadastrar')
  @Post('conversas/:id/mensagens')
  enviar(
    @Param('id') id: string,
    @Body() dto: WhatsappEnviarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversas.enviar(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Vincular o contato a um cliente',
    description:
      'É o vínculo que autoriza a gravação da conversa. O cliente precisa estar ' +
      'na carteira de quem vincula. Requer whatsapp-conversas.editar.',
  })
  @RequirePermission('whatsapp-conversas', 'editar')
  @Put('conversas/:id/vinculo')
  vincular(
    @Param('id') id: string,
    @Body() dto: WhatsappVincularDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversas.vincular(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({ summary: 'Marcar a conversa como lida' })
  @RequirePermission('whatsapp-conversas', 'visualizar')
  @Post('conversas/:id/lida')
  marcarLida(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.conversas.marcarLida(user.empresaAtivaId, user, id);
  }
}
