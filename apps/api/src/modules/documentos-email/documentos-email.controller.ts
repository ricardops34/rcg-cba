import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ENVIO_EMAIL_RESULTADO_EXAMPLE } from '@plataforma/contracts';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { DocumentosEmailService } from './documentos-email.service';
import {
  EnviarBoletoEmailDto,
  EnviarNotaEmailDto,
} from './documentos-email.dto';

/**
 * 2ª via e cobrança por e-mail. O destinatário é sempre o e-mail do cadastro
 * do cliente; as permissões são as de quem já baixa o mesmo documento.
 */
@ApiTags('documentos-email')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('documentos-email')
export class DocumentosEmailController {
  constructor(private readonly service: DocumentosEmailService) {}

  @ApiOperation({
    summary: 'Enviar DANFE (e XML) por e-mail ao cliente',
    description:
      'Manda a 2ª via da nota para o e-mail do cadastro do cliente e registra no histórico de ' +
      'atendimento. 409 sem XML, sem e-mail no cliente ou sem SMTP configurado; 502 quando o ' +
      'servidor de e-mail recusa. Requer notas-saida.visualizar ou posicao-cliente.visualizar.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: ENVIO_EMAIL_RESULTADO_EXAMPLE },
  })
  @RequirePermission('notas-saida', 'visualizar', [
    'posicao-cliente',
    'visualizar',
  ])
  @HttpCode(200)
  @Post('nota/:id')
  enviarNota(
    @Param('id') id: string,
    @Body() dto: EnviarNotaEmailDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.enviarNota(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Enviar boleto por e-mail ao cliente',
    description:
      'Manda a 2ª via do boleto (atualizado ou original) para o e-mail do cadastro do cliente e ' +
      'registra no histórico de atendimento. Requer titulos-receber.visualizar ou ' +
      'posicao-cliente.visualizar.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: ENVIO_EMAIL_RESULTADO_EXAMPLE },
  })
  @RequirePermission('titulos-receber', 'visualizar', [
    'posicao-cliente',
    'visualizar',
  ])
  @HttpCode(200)
  @Post('titulo/:id')
  enviarBoleto(
    @Param('id') id: string,
    @Body() dto: EnviarBoletoEmailDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.enviarBoleto(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Enviar cobrança dos títulos vencidos por e-mail',
    description:
      'Posição dos títulos vencidos do cliente (até 30), com o boleto atualizado de cada um e o ' +
      'DANFE da nota de origem, para o e-mail do cadastro. Entra no histórico de atendimento. ' +
      'Requer titulos-receber.visualizar ou posicao-cliente.visualizar.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: ENVIO_EMAIL_RESULTADO_EXAMPLE },
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
    return this.service.enviarCobranca(user.empresaAtivaId, user, clienteId);
  }
}
