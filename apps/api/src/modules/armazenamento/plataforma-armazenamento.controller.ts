import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { MidiaOrfaService } from './midia-orfa.service';

class VarrerMidiaOrfaDto {
  /** `false` só lista; `true` apaga os órfãos encontrados. */
  @IsBoolean()
  apagar!: boolean;
}

/**
 * Armazenamento de arquivos — **só administração da plataforma**, pelo mesmo
 * motivo do `PlataformaErrosController`: a varredura lê todas as empresas.
 */
@ApiTags('plataforma')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('plataforma/armazenamento')
export class PlataformaArmazenamentoController {
  constructor(private readonly midiaOrfa: MidiaOrfaService) {}

  @ApiOperation({
    summary: 'Mídia órfã do WhatsApp',
    description:
      'Arquivos da pasta da mídia que nenhuma mensagem nem foto de contato referencia, ' +
      'com mais de 24 h. Com `apagar: false` só lista; com `true`, apaga.',
  })
  @Post('midia-orfa')
  @HttpCode(200)
  varrerMidiaOrfa(@Body() dto: VarrerMidiaOrfaDto) {
    return this.midiaOrfa.varrer(dto.apagar);
  }
}
