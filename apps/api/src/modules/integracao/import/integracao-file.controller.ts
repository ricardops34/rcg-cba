import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
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

  // Não há `exportar`: o que a plataforma envia ao ERP sai pelas filas
  // (`orcamentos/pendentes`, `clientes/alteracoes`, `equipamentos-comodato/alteracoes`).
}
