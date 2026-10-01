import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  ENVIO_SMS_RESULTADO_EXAMPLE,
  type SmsConfiguracao,
} from '@plataforma/contracts';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { segredoWebhook, SmsService } from './sms.service';
import { SmsClienteService } from './sms-cliente.service';
import { SmsRelatorioService } from './sms-relatorio.service';
import { SmsWebhookService, type WebhookSmsQuery } from './sms-webhook.service';
import {
  EnviarBoletoSmsDto,
  EnviarSmsClienteDto,
  SmsConfiguracaoUpdateDto,
  SmsFiltroDto,
} from './sms.dto';

/** URL pública da API vista por quem chamou (atrás do proxy, o host dele). */
function baseDaApi(req: Request) {
  const proto =
    String(req.headers['x-forwarded-proto'] ?? '').split(',')[0] ||
    req.protocol;
  const host =
    String(req.headers['x-forwarded-host'] ?? '').split(',')[0] ||
    req.get('host');
  return `${proto}://${host}`;
}

/**
 * SMS pela iAgente (docs/planos/2026-10-01-sms-iagente.md): envio ao cliente
 * (boleto, cobrança, mensagem livre) e a tela Administração > SMS
 * (configuração com saldo, estatística e histórico).
 */
@ApiTags('sms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sms')
export class SmsController {
  constructor(
    private readonly sms: SmsService,
    private readonly cliente: SmsClienteService,
    private readonly relatorio: SmsRelatorioService,
  ) {}

  @ApiOperation({
    summary: 'Enviar boleto por SMS ao cliente',
    description:
      'Valor, vencimento e linha digitável para o celular do cadastro do cliente; entra no ' +
      'histórico de atendimento. Requer titulos-receber.visualizar ou posicao-cliente.visualizar.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: ENVIO_SMS_RESULTADO_EXAMPLE },
  })
  @RequirePermission('titulos-receber', 'visualizar', [
    'posicao-cliente',
    'visualizar',
  ])
  @HttpCode(200)
  @Post('titulo/:id')
  enviarBoleto(
    @Param('id') id: string,
    @Body() dto: EnviarBoletoSmsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cliente.enviarBoleto(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Enviar cobrança dos títulos vencidos por SMS',
    description:
      'Quantidade e total dos vencidos, com o contato da empresa. Entra no histórico de ' +
      'atendimento. Requer titulos-receber.visualizar ou posicao-cliente.visualizar.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: ENVIO_SMS_RESULTADO_EXAMPLE },
  })
  @RequirePermission('titulos-receber', 'visualizar', [
    'posicao-cliente',
    'visualizar',
  ])
  @HttpCode(200)
  @Post('cobranca/:clienteId')
  enviarCobranca(
    @Param('clienteId') clienteId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cliente.enviarCobranca(user.empresaAtivaId, user, clienteId);
  }

  @ApiOperation({
    summary: 'Enviar mensagem livre por SMS ao cliente',
    description:
      'Texto do vendedor, com o nome da empresa na frente, para o celular do cadastro. Entra ' +
      'no histórico de atendimento. Requer posicao-cliente.visualizar ou clientes.visualizar.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: ENVIO_SMS_RESULTADO_EXAMPLE },
  })
  @RequirePermission('posicao-cliente', 'visualizar', [
    'clientes',
    'visualizar',
  ])
  @HttpCode(200)
  @Post('cliente/:clienteId')
  enviarMensagem(
    @Param('clienteId') clienteId: string,
    @Body() dto: EnviarSmsClienteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cliente.enviarMensagem(
      user.empresaAtivaId,
      user,
      clienteId,
      dto,
    );
  }

  @ApiOperation({
    summary: 'Configuração do SMS (parâmetros SMS_*), saldo e URL do webhook',
    description:
      'Os parâmetros SMS_* da empresa juntos, sem o token (só se ele está preenchido). A URL do ' +
      'webhook é a que se cadastra no painel da iAgente. Requer sms.visualizar.',
  })
  @RequirePermission('sms', 'visualizar')
  @Get('configuracao')
  async configuracao(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<SmsConfiguracao> {
    const empresaId = user.empresaAtivaId;
    const { token, ...config } = await this.sms.config(empresaId);
    let saldo: SmsConfiguracao['saldo'] = null;
    let erroSaldo: string | null = null;
    if (token) {
      try {
        saldo = await this.sms.saldo(empresaId);
      } catch (erro) {
        erroSaldo = (erro as Error).message;
      }
    }
    return {
      ...config,
      tokenPreenchido: !!token,
      habilitado: config.ativo && !!token,
      saldo,
      erroSaldo,
      webhookUrl: `${baseDaApi(req)}/api/v1/sms/webhook/${empresaId}/${segredoWebhook(empresaId)}`,
    };
  }

  @ApiOperation({
    summary: 'Gravar a configuração do SMS',
    description:
      'Grava os parâmetros SMS_*. O token só é trocado quando vem preenchido. Requer sms.editar.',
  })
  @RequirePermission('sms', 'editar')
  @Put('configuracao')
  async salvarConfiguracao(
    @Body() dto: SmsConfiguracaoUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<SmsConfiguracao> {
    await this.sms.salvarConfig(user.empresaAtivaId, user.id, dto);
    return this.configuracao(user, req);
  }

  @ApiOperation({
    summary: 'O que de SMS está disponível para a tela',
    description:
      'Só booleanos: SMS habilitado (ativo e com token) e cada funcionalidade. É o que mostra ou ' +
      'esconde os botões de SMS. Qualquer usuário autenticado.',
  })
  @Get('disponivel')
  disponivel(@CurrentUser() user: AuthenticatedUser) {
    return this.sms.disponibilidade(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Estatística dos envios de SMS por ano/mês',
    description: 'Requer sms.visualizar.',
  })
  @RequirePermission('sms', 'visualizar')
  @Get('estatisticas')
  estatisticas(
    @Query() filtro: SmsFiltroDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.relatorio.estatisticas(user.empresaAtivaId, filtro);
  }

  @ApiOperation({
    summary: 'Histórico dos envios de SMS, com as respostas',
    description:
      'Filtros por ano, mês, motivo e situação. Requer sms.visualizar.',
  })
  @RequirePermission('sms', 'visualizar')
  @Get('envios')
  envios(
    @Query() filtro: SmsFiltroDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.relatorio.envios(user.empresaAtivaId, filtro);
  }
}

/**
 * Webhook da iAgente: status de entrega e respostas do cliente. Público — a
 * iAgente não autentica —, protegido pelo segredo na URL (ver
 * `segredoWebhook`). Responde 200 a tudo que tenha o segredo certo, para ela
 * não repetir à toa.
 */
@ApiTags('sms')
@SkipThrottle()
@Controller('sms/webhook')
export class SmsWebhookController {
  constructor(private readonly webhook: SmsWebhookService) {}

  @ApiExcludeEndpoint()
  @Get(':empresaId/:segredo')
  async receber(
    @Param('empresaId') empresaId: string,
    @Param('segredo') segredo: string,
    @Query() query: WebhookSmsQuery,
  ) {
    await this.webhook.processar(empresaId, segredo, query);
    return 'OK';
  }
}
