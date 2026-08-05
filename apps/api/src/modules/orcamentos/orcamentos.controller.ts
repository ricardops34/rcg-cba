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
import { ApiQuery } from '@nestjs/swagger';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrcamentosService } from './orcamentos.service';
import {
  OrcamentoCreateDto,
  OrcamentoQueryDto,
  OrcamentoUpdateDto,
} from './dto/orcamento.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApiPaginationQuery } from '../../common/decorators/api-pagination-query.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('orcamentos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('orcamentos')
export class OrcamentosController {
  constructor(private readonly service: OrcamentosService) {}

  // Declarado antes de GET :id, senão o Nest casa "preco-produto" como :id.
  @ApiOperation({
    summary: 'Preço de um produto pra um cliente',
    description:
      'vlrTabela vem da Tabela de Preço vinculada ao cliente; ultimoPreco do produto é ' +
      'retornado como referência quando não há preço de tabela. Alimenta o pré-preenchimento ' +
      'do form de orçamento. Requer orcamentos.visualizar.',
  })
  @ApiQuery({ name: 'clienteId', required: true })
  @ApiQuery({ name: 'produtoId', required: true })
  @RequirePermission('orcamentos', 'visualizar')
  @Get('preco-produto')
  precoProduto(
    @Query('clienteId') clienteId: string,
    @Query('produtoId') produtoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.precoProduto(user.empresaAtivaId, user, clienteId, produtoId);
  }

  @ApiOperation({
    summary: 'Listar orçamentos',
    description:
      'Propostas comerciais (cabeçalho + itens), restritas ao escopo hierárquico do usuário ' +
      'logado. Busca por título, filtra por status, cliente, oportunidade, vendedor e ativo. ' +
      'Requer orcamentos.visualizar.',
  })
  @ApiPaginationQuery()
  @RequirePermission('orcamentos', 'visualizar')
  @Get()
  findAll(@Query() query: OrcamentoQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.empresaAtivaId, user, query);
  }

  @ApiOperation({ summary: 'Detalhar orçamento', description: 'Requer orcamentos.visualizar.' })
  @RequirePermission('orcamentos', 'visualizar')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(user.empresaAtivaId, user, id);
  }

  @ApiOperation({
    summary: 'Cadastrar orçamento',
    description:
      'Cria o orçamento junto com os itens. O preço unitário de cada item é informado pelo ' +
      'vendedor (pré-preenchido no front a partir da Tabela de Preço do cliente); o server ' +
      'recalcula vlrTabela/desconto/total a partir da mesma tabela. Requer orcamentos.cadastrar.',
  })
  @RequirePermission('orcamentos', 'cadastrar')
  @Post()
  create(@Body() dto: OrcamentoCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.empresaAtivaId, user, dto);
  }

  @ApiOperation({
    summary: 'Editar orçamento',
    description:
      'Quando "itens" é enviado, substitui o conjunto inteiro de itens e recalcula o total. ' +
      'Orçamento com status "aprovado" não pode mais ser alterado (409). Requer orcamentos.editar.',
  })
  @RequirePermission('orcamentos', 'editar')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: OrcamentoUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(user.empresaAtivaId, user, id, dto);
  }

  @ApiOperation({
    summary: 'Excluir orçamento (soft delete)',
    description: 'Requer orcamentos.excluir.',
  })
  @RequirePermission('orcamentos', 'excluir')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(user.empresaAtivaId, user, id);
  }
}
