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
import { PRODUTO_RELACIONADO_EXAMPLE } from '@plataforma/contracts';
import { produtoFotoUploadOptions } from '../../common/uploads/uploads.config';
import { ProdutosService } from './produtos.service';
import { ProdutoRelacionadosService } from './produto-relacionados.service';
import { ProdutoFichasService } from './produto-fichas.service';
import {
  ProdutoCreateDto,
  ProdutoQueryDto,
  ProdutoFichaAtualizarDto,
  ProdutoRelacionadoCriarDto,
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
  constructor(
    private readonly service: ProdutosService,
    private readonly relacionados: ProdutoRelacionadosService,
    private readonly fichas: ProdutoFichasService,
  ) {}

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

  // ---------------- similares e aplicação ----------------

  @ApiOperation({
    summary: 'Produtos relacionados a este',
    description:
      'Similares e aplicação, **dos dois lados**: as relações cadastradas ' +
      'aqui e as que apontam para cá. Cada linha diz em `origem` de que lado ' +
      'foi cadastrada — é o que muda o rótulo de "usa" para "usado em". ' +
      'Requer produtos.visualizar.',
  })
  @ApiResponse({
    status: 200,
    schema: { example: [PRODUTO_RELACIONADO_EXAMPLE] },
  })
  @RequirePermission('produtos', 'visualizar', [
    'posicao-cliente',
    'visualizar',
  ])
  @Get(':id/relacionados')
  listarRelacionados(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.relacionados.listar(user.empresaAtivaId, id);
  }

  @ApiOperation({
    summary: 'Relacionar outro produto a este',
    description:
      'O similar é simétrico e basta cadastrar de um lado. A aplicação é ' +
      'direcional: cadastre no equipamento os produtos que ele usa. Requer ' +
      'produtos.editar.',
  })
  @RequirePermission('produtos', 'editar')
  @Post(':id/relacionados')
  criarRelacionado(
    @Param('id') id: string,
    @Body() dto: ProdutoRelacionadoCriarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.relacionados.criar(user.empresaAtivaId, user.id, id, dto);
  }

  @ApiOperation({
    summary: 'Desfazer uma relação',
    description:
      'Aceita remover pela ponta que estiver aberta na tela — quem vê ' +
      '"usado em" não precisa ir até o outro produto. Requer produtos.editar.',
  })
  @RequirePermission('produtos', 'editar')
  @Delete(':id/relacionados/:relacaoId')
  removerRelacionado(
    @Param('id') id: string,
    @Param('relacaoId') relacaoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.relacionados.remover(user.empresaAtivaId, id, relacaoId);
  }

  // ---------------- fichas técnicas ----------------

  @ApiOperation({
    summary: 'Fichas técnicas do produto',
    description:
      'Cada ficha traz o PDF (para baixar e mandar ao cliente) e o Markdown ' +
      'que o assistente extraiu dele (que é o que a IA lê). Requer ' +
      'produtos.visualizar.',
  })
  @RequirePermission('produtos', 'visualizar', [
    'posicao-cliente',
    'visualizar',
  ])
  @Get(':id/fichas')
  listarFichas(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fichas.listar(user.empresaAtivaId, id);
  }

  @ApiOperation({
    summary: 'Editar uma ficha técnica',
    description:
      'O Markdown é editável de propósito: é aqui que se retira do texto o que ' +
      'não deve chegar ao modelo, como a tabela de preço do fabricante. ' +
      '`visivelAgente: false` tira a ficha do alcance da IA sem apagá-la. ' +
      'Requer produtos.editar.',
  })
  @RequirePermission('produtos', 'editar')
  @Patch(':id/fichas/:fichaId')
  atualizarFicha(
    @Param('id') id: string,
    @Param('fichaId') fichaId: string,
    @Body() dto: ProdutoFichaAtualizarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fichas.atualizar(user.empresaAtivaId, user, id, fichaId, dto);
  }

  @ApiOperation({
    summary: 'Excluir uma ficha técnica',
    description: 'O PDF sai do disco junto. Requer produtos.editar.',
  })
  @RequirePermission('produtos', 'editar')
  @Delete(':id/fichas/:fichaId')
  removerFicha(
    @Param('id') id: string,
    @Param('fichaId') fichaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fichas.remover(user.empresaAtivaId, user, id, fichaId);
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
