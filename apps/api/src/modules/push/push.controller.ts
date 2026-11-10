import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import {
  pushAssinaturaInputSchema,
  pushCancelarInputSchema,
} from '@plataforma/contracts';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { PushService } from './push.service';

class PushAssinaturaDto extends createZodDto(pushAssinaturaInputSchema) {}
class PushCancelarDto extends createZodDto(pushCancelarInputSchema) {}

@ApiTags('push')
@ApiBearerAuth()
// Sem PermissionsGuard, como o sino: é o aparelho do próprio usuário, não uma
// tela com rotina. Toda rota mexe só nas assinaturas de quem está logado.
@UseGuards(JwtAuthGuard)
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @ApiOperation({
    summary: 'Chave pública do aviso no celular (null = desligado)',
  })
  @Get('config')
  config() {
    return this.push.config();
  }

  @ApiOperation({ summary: 'Liga o aviso no celular neste aparelho' })
  @Post('assinar')
  @HttpCode(200)
  assinar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PushAssinaturaDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.push.assinar(user, dto, userAgent);
  }

  @ApiOperation({ summary: 'Desliga o aviso no celular neste aparelho' })
  @Post('cancelar')
  @HttpCode(200)
  cancelar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PushCancelarDto,
  ) {
    return this.push.cancelar(user, dto.endpoint);
  }

  @ApiOperation({ summary: 'Manda um aviso de teste aos aparelhos do usuário' })
  @Post('testar')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  testar(@CurrentUser() user: AuthenticatedUser) {
    return this.push.testar(user);
  }
}
