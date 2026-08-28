import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { produtoFotoCriterioSchema } from '@plataforma/contracts';
import { produtoFotoUploadOptions } from '../../common/uploads/uploads.config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { ProdutoFotoVincularDto } from './dto/produto.dto';
import { ProdutoFotosImportacaoService } from './produto-fotos-importacao.service';

@ApiTags('produto-fotos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('produto-fotos')
export class ProdutoFotosImportacaoController {
  constructor(private readonly service: ProdutoFotosImportacaoService) {}

  @ApiOperation({ summary: 'Importar fotos e associar pelo nome do arquivo' })
  @ApiConsumes('multipart/form-data')
  @RequirePermission('produtos', 'importar')
  @Post('importar')
  @UseInterceptors(FilesInterceptor('files', 100, produtoFotoUploadOptions))
  importar(
    @UploadedFiles() files: Express.Multer.File[],
    @Query('criterio') criterioBruto: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!files?.length) throw new BadRequestException('Nenhuma foto enviada');
    const criterio = produtoFotoCriterioSchema.safeParse(criterioBruto);
    if (!criterio.success)
      throw new BadRequestException('Critério de associação inválido');
    return this.service.importar(
      user.empresaAtivaId,
      user,
      criterio.data,
      files,
    );
  }

  @RequirePermission('produtos', 'importar')
  @Get('pendentes')
  listarPendentes(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listarPendentes(user.empresaAtivaId);
  }

  @RequirePermission('produtos', 'importar')
  @Post(':id/vincular')
  vincular(
    @Param('id') id: string,
    @Body() dto: ProdutoFotoVincularDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.vincular(user.empresaAtivaId, user, id, dto.produtoId);
  }

  @RequirePermission('produtos', 'importar')
  @Delete(':id')
  remover(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removerPendente(user.empresaAtivaId, id);
  }
}
