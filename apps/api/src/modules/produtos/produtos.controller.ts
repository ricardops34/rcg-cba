import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { produtoFotoUploadOptions } from '../../common/uploads/uploads.config';
import { ProdutosService } from './produtos.service';
import {
  ProdutoCreateDto,
  ProdutoQueryDto,
  ProdutoUpdateDto,
} from './dto/produto.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('produtos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('produtos')
export class ProdutosController {
  constructor(private readonly service: ProdutosService) {}

  @ApiOperation({
    summary: 'Listar produtos',
    description:
      'Catálogo da empresa ativa. Busca por descrição, código ERP, marca, categoria ou código de barras. Requer produtos.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('produtos', 'visualizar')
  @Get()
  findAll(
    @Query() query: ProdutoQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.findAll(user.empresaAtivaId, query);
  }

  @ApiOperation({
    summary: 'Detalhar produto',
    description:
      'Requer produtos.visualizar ou posicao-cliente.visualizar — a cortina de detalhe da ' +
      'Posição de Cliente abre esta rota a partir do mix de produtos que a própria tela já listou.',
  })
  @RequirePermission('produtos', 'visualizar', [
    'posicao-cliente',
    'visualizar',
  ])
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, id);
  }

  @ApiOperation({
    summary: 'Cadastrar produto',
    description: 'Requer produtos.cadastrar.',
  })
  @RequirePermission('produtos', 'cadastrar')
  @Post()
  create(
    @Body() dto: ProdutoCreateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({
    summary: 'Editar produto',
    description: 'Requer produtos.editar.',
  })
  @RequirePermission('produtos', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: ProdutoUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({ summary: 'Enviar foto do produto' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Foto gravada no produto' })
  @RequirePermission('produtos', 'editar')
  @Post(':id/foto')
  @UseInterceptors(FileInterceptor('file', produtoFotoUploadOptions))
  uploadFoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    return this.service.setFoto(
      user.empresaAtivaId,
      user,
      id,
      file.filename,
      file.originalname,
    );
  }

  @ApiOperation({ summary: 'Definir a foto principal do produto' })
  @RequirePermission('produtos', 'editar')
  @Patch(':id/fotos/:fotoId/principal')
  definirFotoPrincipal(
    @Param('id') id: string,
    @Param('fotoId') fotoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.definirFotoPrincipal(
      user.empresaAtivaId,
      user,
      id,
      fotoId,
    );
  }

  @ApiOperation({ summary: 'Remover uma foto do produto' })
  @RequirePermission('produtos', 'editar')
  @Delete(':id/fotos/:fotoId')
  removerFoto(
    @Param('id') id: string,
    @Param('fotoId') fotoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.removerFoto(user.empresaAtivaId, user, id, fotoId);
  }

  @ApiOperation({
    summary: 'Excluir produto (soft delete)',
    description: 'Requer produtos.excluir.',
  })
  @RequirePermission('produtos', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
