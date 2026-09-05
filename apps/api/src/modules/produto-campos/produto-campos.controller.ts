import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PRODUTO_CAMPO_EXAMPLE } from '@plataforma/contracts';
import { ProdutoCamposService } from './produto-campos.service';
import {
  ProdutoCampoCreateDto,
  ProdutoCampoUpdateDto,
  ProdutoCamposGravarDto,
} from './dto/produto-campo.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

/**
 * Campos complementares de produto.
 *
 * Duas permissões diferentes, porque são dois trabalhos diferentes: decidir
 * **quais** campos existem é configuração da empresa (`produtos-campos`);
 * preencher o valor de um produto é trabalho de quem cuida do cadastro
 * (`produtos.editar`).
 */
@ApiTags('produtos-campos')
@ApiBearerAuth()
@Controller()
export class ProdutoCamposController {
  constructor(private readonly service: ProdutoCamposService) {}

  @ApiOperation({
    summary: 'Campos complementares definidos pela empresa',
    description:
      'Qualquer usuário autenticado consulta — é esta lista que monta o ' +
      'formulário do produto. `ativos=true` traz só os que aparecem na tela.',
  })
  @ApiResponse({ status: 200, schema: { example: [PRODUTO_CAMPO_EXAMPLE] } })
  @UseGuards(JwtAuthGuard)
  @Get('produtos-campos')
  listar(
    @CurrentUser() user: AuthenticatedUser,
    @Query('ativos') ativos?: string,
  ) {
    return this.service.listar(user.empresaAtivaId, ativos === 'true');
  }

  @ApiOperation({
    summary: 'Criar um campo complementar',
    description:
      'A chave é o identificador estável do campo e não muda depois. Requer ' +
      'produtos-campos.cadastrar.',
  })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('produtos-campos', 'cadastrar')
  @Post('produtos-campos')
  criar(
    @Body() dto: ProdutoCampoCreateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.criar(user.empresaAtivaId, user.id, dto);
  }

  @ApiOperation({
    summary: 'Alterar um campo complementar',
    description:
      'A chave não é alterável. O tipo deixa de ser alterável assim que algum ' +
      'produto tem o campo preenchido. Requer produtos-campos.editar.',
  })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('produtos-campos', 'editar')
  @Patch('produtos-campos/:id')
  atualizar(
    @Param('id') id: string,
    @Body() dto: ProdutoCampoUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.atualizar(user.empresaAtivaId, user.id, id, dto);
  }

  @ApiOperation({
    summary: 'Excluir um campo complementar',
    description:
      'Exclusão lógica, e o que os produtos têm preenchido continua gravado. ' +
      'Para tirar da tela sem excluir, desative. Requer produtos-campos.excluir.',
  })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('produtos-campos', 'excluir')
  @Delete('produtos-campos/:id')
  remover(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remover(user.empresaAtivaId, user.id, id);
  }

  @ApiOperation({
    summary: 'Campos complementares de um produto, com os valores',
    description:
      'Devolve **todos** os campos ativos, preenchidos ou não — é o formulário ' +
      'inteiro. Requer produtos.visualizar.',
  })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('produtos', 'visualizar')
  @Get('produtos/:id/campos')
  valores(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.valoresDoProduto(user.empresaAtivaId, id);
  }

  @ApiOperation({
    summary: 'Gravar os campos complementares de um produto',
    description:
      'Recebe o formulário inteiro. Valor vazio apaga o preenchimento. Cada ' +
      'valor é validado contra o tipo da definição. Requer produtos.editar.',
  })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('produtos', 'editar')
  @Patch('produtos/:id/campos')
  gravar(
    @Param('id') id: string,
    @Body() dto: ProdutoCamposGravarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.gravarValores(user.empresaAtivaId, user.id, id, dto);
  }
}
