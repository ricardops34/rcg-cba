import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsString, Matches } from 'class-validator';
import { armazenamento } from '../../common/armazenamento/armazenamento';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { MidiaOrfaService } from './midia-orfa.service';

class VarrerMidiaOrfaDto {
  /** `false` só lista; `true` apaga os órfãos encontrados. */
  @IsBoolean()
  apagar!: boolean;
}

class MigrarPastaDto {
  /** Primeiro segmento da chave: `whatsapp`, `fichas`… */
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  pasta!: string;
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

  @ApiOperation({
    summary: 'Situação do armazenamento',
    description:
      'Se o S3 (MinIO) está configurado, quais pastas vão para ele e quantos arquivos dessas pastas ainda estão em disco.',
  })
  @Get('situacao')
  situacao() {
    return armazenamento().situacao();
  }

  @ApiOperation({
    summary: 'Copiar uma pasta do disco para o S3',
    description:
      'Uma rodada de até 200 arquivos: sobe, confere o tamanho no S3 e só então apaga do disco. ' +
      'Chamar de novo até `restantes` zerar (ou uma rodada não copiar nada).',
  })
  @Post('migrar')
  @HttpCode(200)
  async migrar(@Body() dto: MigrarPastaDto) {
    try {
      return await armazenamento().migrarParaS3(dto.pasta);
    } catch (erro) {
      throw new BadRequestException((erro as Error).message);
    }
  }
}
