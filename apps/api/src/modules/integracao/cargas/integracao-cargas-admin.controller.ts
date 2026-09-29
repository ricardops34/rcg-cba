import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  INTEGRACAO_CARGA_EXAMPLE,
  INTEGRACAO_CARGA_MAX_BYTES,
} from '@plataforma/contracts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../common/decorators/current-user.decorator';
import { IntegracaoCargasService } from './integracao-cargas.service';
import {
  IntegracaoCargaErrosQueryDto,
  IntegracaoCargaLimparDto,
  IntegracaoCargaListaQueryDto,
  IntegracaoCargaProcessarDto,
  IntegracaoCargaReprocessarDto,
} from './dto/integracao-carga.dto';

/**
 * A carga por arquivo pela tela (Administração > Integração), com o login do
 * usuário. As mesmas operações do `IntegracaoCargasController` — que atende o
 * ERP pela chave de API — sobre o mesmo service: recebe, guarda e responde; o
 * `CargasProcessador` aplica pelo schema e pelo `upsertLote` do `PUT`.
 *
 * Permissões: as da tela de Integração. Ver
 * docs/planos/2026-09-28-carga-por-arquivo.md, *Tela de cargas*.
 */
@ApiTags('integracao-cargas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('integracao-cargas')
export class IntegracaoCargasAdminController {
  constructor(private readonly service: IntegracaoCargasService) {}

  @ApiOperation({
    summary: 'Subir um arquivo de carga',
    description:
      'multipart/form-data: "file" = o arquivo em JSON Lines ' +
      '({"entidade":"...","registro":{...}} por linha), compactado em gzip ou ' +
      'não;"apiKeyId" = a chave de API em nome da qual a carga fica, que ' +
      'precisa ser da empresa ativa; "descricao" opcional. ' +
      'Responde 202 e a carga fica AGUARDANDO: quem manda processar é ' +
      'POST /integracao-cargas/processar. ' +
      'Requer integracao.cadastrar.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'apiKeyId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        apiKeyId: { type: 'string', format: 'uuid' },
        descricao: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 202, schema: { example: INTEGRACAO_CARGA_EXAMPLE } })
  @RequirePermission('integracao', 'cadastrar')
  @Post()
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: INTEGRACAO_CARGA_MAX_BYTES, files: 1 },
    }),
  )
  async receber(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('apiKeyId', ParseUUIDPipe) apiKeyId: string,
    @Body('descricao') descricao: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('Envie o arquivo no campo "file".');
    }
    await this.service.conferirChave(user.empresaAtivaId, apiKeyId);
    return this.service.receber(
      user.empresaAtivaId,
      apiKeyId,
      file.buffer,
      descricao || file.originalname,
      { aguardar: true },
    );
  }

  @ApiOperation({
    summary: 'Processar as cargas que aguardam',
    description:
      'Manda para a fila as cargas subidas pela tela - todas, ou só as ' +
      '"ids". O processamento é em segundo plano, no servidor, na ordem em ' +
      'que foram subidas. Requer integracao.editar.',
  })
  @RequirePermission('integracao', 'editar')
  @Post('processar')
  @HttpCode(200)
  processar(
    @Body() dto: IntegracaoCargaProcessarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.processar(user.empresaAtivaId, dto.ids);
  }

  @ApiOperation({
    summary: 'Reprocessar cargas',
    description:
      'A carga terminada volta para a fila e roda o arquivo inteiro de ' +
      'novo (a gravação é por chave, não duplica). Sem "ids", todas as com ' +
      'erro. Requer integracao.editar.',
  })
  @RequirePermission('integracao', 'editar')
  @Post('reprocessar')
  @HttpCode(200)
  reprocessar(
    @Body() dto: IntegracaoCargaReprocessarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.reprocessar(user.empresaAtivaId, dto.ids);
  }

  @ApiOperation({
    summary: 'Limpar cargas de um grupo',
    description:
      'Exclui de uma vez as cargas do grupo (processados, com-erro, ' +
      'canceladas, ou as que aguardam). Some o registro e o arquivo ' +
      'guardado; os dados já gravados ficam. Requer integracao.excluir.',
  })
  @RequirePermission('integracao', 'excluir')
  @Post('limpar')
  @HttpCode(200)
  limpar(
    @Body() dto: IntegracaoCargaLimparDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.limpar(user.empresaAtivaId, dto.grupo);
  }

  @ApiOperation({
    summary: 'Excluir uma carga',
    description:
      'A que aguarda (subida por engano) ou a que já terminou. Some o ' +
      'registro e o arquivo guardado; os dados já gravados ficam. A que ' +
      'está na fila ou rodando, não. Requer integracao.excluir.',
  })
  @RequirePermission('integracao', 'excluir')
  @Delete(':id')
  @HttpCode(204)
  excluir(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.excluir(user.empresaAtivaId, id);
  }

  @ApiOperation({
    summary: 'Listar as cargas por arquivo',
    description:
      'Paginada (mais recentes primeiro), filtrável por situação, com o ' +
      'resumo por situação da empresa toda e a carga que está rodando ' +
      'agora. Requer integracao.visualizar.',
  })
  @RequirePermission('integracao', 'visualizar')
  @Get()
  listar(
    @Query() query: IntegracaoCargaListaQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listarPagina(user.empresaAtivaId, query);
  }

  @ApiOperation({
    summary: 'Situação e progresso de uma carga',
    description: 'Requer integracao.visualizar.',
  })
  @RequirePermission('integracao', 'visualizar')
  @Get(':id')
  obter(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.obter(user.empresaAtivaId, id);
  }

  @ApiOperation({
    summary: 'Registros recusados de uma carga',
    description:
      'Linha do arquivo, entidade, chave e motivo. Requer integracao.visualizar.',
  })
  @RequirePermission('integracao', 'visualizar')
  @Get(':id/erros')
  erros(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: IntegracaoCargaErrosQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.erros(user.empresaAtivaId, id, query);
  }

  @ApiOperation({
    summary: 'Cancelar uma carga',
    description:
      'Não começada: cancela na hora. Em andamento: para no fim do bloco ' +
      'atual. Requer integracao.editar.',
  })
  @RequirePermission('integracao', 'editar')
  @Post(':id/cancelar')
  @HttpCode(200)
  cancelar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.cancelar(user.empresaAtivaId, id);
  }
}
