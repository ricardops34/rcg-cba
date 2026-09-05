import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { fichaImportacaoUploadOptions } from '../../common/uploads/uploads.config';
import { FichaImportacaoService } from './ficha-importacao.service';
import { FichaImportacaoVincularDto } from './dto/produto.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

/**
 * Importação em lote de fichas técnicas.
 *
 * Mesma permissão da importação de fotos (`produtos.importar`), e pela mesma
 * razão: é carga de cadastro, não edição de um produto.
 *
 * O upload **não** processa nada — ele grava os PDFs e devolve. A leitura de
 * cada arquivo é uma chamada paga ao provedor de IA, e um lote não cabe no
 * tempo de uma requisição; quem processa é a varredura, e a tela acompanha.
 */
@ApiTags('produto-fichas-importacao')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('produto-fichas-importacao')
export class FichaImportacaoController {
  constructor(private readonly service: FichaImportacaoService) {}

  @ApiOperation({
    summary: 'Enviar PDFs de ficha técnica para processamento',
    description:
      'Até 100 PDFs por lote. Devolve na hora, com os arquivos na fila: o ' +
      'vínculo com o produto é feito pelo **conteúdo** de cada documento, não ' +
      'pelo nome do arquivo. Requer produtos.importar.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @RequirePermission('produtos', 'importar')
  @Post('importar')
  @UseInterceptors(FilesInterceptor('files', 100, fichaImportacaoUploadOptions))
  importar(
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!files?.length) throw new BadRequestException('Nenhum arquivo enviado');
    return this.service.receber(user.empresaAtivaId, user, files);
  }

  @ApiOperation({
    summary: 'Situação dos PDFs enviados',
    description:
      'A fila inteira, do mais recente para trás: o que já foi vinculado, o ' +
      'que espera decisão e o que falhou. Requer produtos.importar.',
  })
  @RequirePermission('produtos', 'importar')
  @Get()
  listar(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listar(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Contagem por situação',
    description:
      'O que a tela usa para saber se ainda há trabalho na fila e se deve ' +
      'continuar acompanhando. Requer produtos.importar.',
  })
  @RequirePermission('produtos', 'importar')
  @Get('resumo')
  resumo(@CurrentUser() user: AuthenticatedUser) {
    return this.service.resumo(user.empresaAtivaId);
  }

  @ApiOperation({
    summary: 'Escolher o produto de uma ficha que ficou pendente',
    description:
      'Para o que o conteúdo não resolveu — nenhum produto encontrado, ou mais ' +
      'de um. O texto já foi extraído e é reaproveitado; o PDF não é lido de ' +
      'novo. Requer produtos.importar.',
  })
  @RequirePermission('produtos', 'importar')
  @Post(':id/vincular')
  vincular(
    @Param('id') id: string,
    @Body() dto: FichaImportacaoVincularDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.vincular(user.empresaAtivaId, user, id, dto.produtoId);
  }

  @ApiOperation({
    summary: 'Descartar um PDF da fila',
    description:
      'O arquivo sai do disco, a menos que já tenha virado ficha de um ' +
      'produto. Requer produtos.importar.',
  })
  @RequirePermission('produtos', 'importar')
  @Delete(':id')
  remover(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remover(user.empresaAtivaId, id);
  }

  @ApiOperation({
    summary: 'Limpar da lista o que já foi vinculado',
    description:
      'Tira da tela o que terminou, deixando à vista só o que ainda pede ' +
      'decisão. As fichas gravadas não são tocadas. Requer produtos.importar.',
  })
  @RequirePermission('produtos', 'importar')
  @Delete('concluidos/limpar')
  limpar(@CurrentUser() user: AuthenticatedUser) {
    return this.service.limparConcluidos(user.empresaAtivaId);
  }
}
