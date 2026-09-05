import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ErrosLogService } from './erros-log.service';
import { ErroClienteReportDto } from './dto/erro-log.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

/**
 * Recebe o que o navegador viu e a API nunca soube (ver
 * `docs/planos/log-de-erros.md`).
 *
 * **Exige login, e isso tem um custo conhecido:** erro na tela de login não é
 * reportado. A alternativa seria uma rota de escrita aberta na internet, que
 * qualquer um poderia usar para encher a tabela — e o incidente que motivou a
 * ferramenta aconteceu com o usuário já logado.
 */
@ApiTags('erros')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('erros')
export class ErrosController {
  constructor(private readonly service: ErrosLogService) {}

  @ApiOperation({
    summary: 'Reportar erros vistos pelo navegador',
    description:
      'Lote de falhas capturadas no cliente (rede, resposta inválida, erro de ' +
      'JavaScript, promessa rejeitada). O envio é em lote porque o buffer local ' +
      'acumula enquanto a API está fora e descarrega quando ela volta.',
  })
  @ApiResponse({ status: 204, description: 'Recebido' })
  // Mais apertado que o teto global (200/min): o buffer descarrega em lotes de
  // até 50, então um cliente saudável não precisa de mais que isto — e um
  // cliente em laço não deve conseguir empurrar o log inteiro sozinho.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(204)
  @Post('cliente')
  async reportar(
    @Body() dto: ErroClienteReportDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    await this.service.registrarDoCliente(dto.erros, {
      usuarioId: user.id,
      usuarioEmail: user.email,
      empresaId: user.empresaAtivaId ?? null,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
