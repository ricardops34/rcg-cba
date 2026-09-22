import { Controller, Post, Get, Body, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity, ApiProduces } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiKeyGuard, type IntegracaoContext } from '../guards/api-key.guard';
import { CurrentIntegracao } from '../decorators/current-integracao.decorator';
import { IntegracaoFileService } from './integracao-file.service';

@ApiTags('Integração - Arquivo TXT')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('integracao/arquivo')
export class IntegracaoFileController {
  constructor(private readonly fileService: IntegracaoFileService) {}

  @Post('importar')
  @ApiOperation({ summary: 'Importa um arquivo TXT/JSON com mensagens de integração' })
  async importarArquivo(
    @CurrentIntegracao() ctx: IntegracaoContext,
    @Body('conteudo') conteudo: string,
  ) {
    return this.fileService.importarArquivo(ctx.empresaId, ctx.apiKeyId, conteudo);
  }

  @Get('exportar')
  @ApiOperation({ summary: 'Exporta as pendências da plataforma em formato TXT para o Protheus' })
  @ApiProduces('text/plain')
  async exportarArquivo(
    @CurrentIntegracao() ctx: IntegracaoContext,
    @Res() res: Response,
  ) {
    const txt = await this.fileService.exportarArquivo(ctx.empresaId);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pendencias_plataforma.txt"');
    res.send(txt);
  }
}
